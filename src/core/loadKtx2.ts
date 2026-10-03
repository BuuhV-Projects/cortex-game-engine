/**
 * Carregamento de texturas **KTX2 / Basis** no host nativo e no Studio.
 *
 * O KTX2 é comprimido (~4–8× menor que PNG em disco) e é o formato dos assets
 * **cozidos no export** (a pasta `assets/` fonte fica PNG; o `export-game.mjs`
 * converte pro pak). No host, `__cortexTranscodeKtx2` (basis_universal em C++)
 * decodifica pra RGBA — o Hermes não roda WASM, então o `KTX2Loader` do three
 * não serve aqui.
 *
 * No Studio, o KTX2Loader do Three usa WASM e workers locais ao bundle.
 * A seleção do formato comprimido usa as capacidades do renderer real.
 */
import {
  CompressedTexture,
  DataTexture,
  RGBAFormat,
  RGBA_BPTC_Format,
  UnsignedByteType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Loader,
  type LoadingManager,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { WebGPURenderer } from 'three/webgpu';

let browserRenderer: WebGPURenderer | null = null;
let browserLoader: KTX2Loader | null = null;
const TRANSCODER_WORKERS = 2;

/** Registra o renderer antes da carga; o transcoder aguarda seu init. */
export function setKtx2Renderer(renderer: WebGPURenderer): void {
  if (!hasNativeKtx2()) browserRenderer = renderer;
}

/** Cria workers somente quando uma textura KTX2 realmente é solicitada. */
async function loadKtx2Browser(url: string): Promise<Texture> {
  const renderer = browserRenderer;
  if (!renderer) throw new Error('loadKtx2: create a Renderer before loading browser KTX2 textures');
  await renderer.init();
  if (!browserLoader) {
    browserLoader = new KTX2Loader()
      .setTranscoderPath(new URL('./basis/', import.meta.url).href)
      .setWorkerLimit(TRANSCODER_WORKERS);
  }
  browserLoader.detectSupport(renderer);
  return browserLoader.loadAsync(url);
}

interface NativeKtx2Result {
  width: number;
  height: number;
  /** `'bc7'` (níveis comprimidos, SPEC-0155) ou `'rgba'` (fallback mip 0). */
  format?: 'bc7' | 'rgba';
  /** Cadeia de mips BC7 (16 B por bloco 4×4), do mip 0 ao menor. */
  levels?: ArrayBuffer[];
  rgba?: ArrayBuffer;
}
type NativeKtx2Fn = (bytes: Uint8Array) => NativeKtx2Result | null;
/** Transcode fora da thread JS (worker do host, SPEC-0287); rejeita se falhar. */
type NativeKtx2AsyncFn = (bytes: Uint8Array) => Promise<NativeKtx2Result>;

/**
 * Transcoda no host: prefere o binding assíncrono (não trava o frame, SPEC-0287)
 * e cai no síncrono em host antigo.
 */
async function transcodeNative(bytes: Uint8Array, url: string): Promise<NativeKtx2Result> {
  const g = globalThis as Record<string, unknown>;
  const transcodeAsync = g['__cortexTranscodeKtx2Async'] as NativeKtx2AsyncFn | undefined;
  if (typeof transcodeAsync === 'function') {
    try {
      return await transcodeAsync(bytes);
    } catch (e) {
      throw new Error(`loadKtx2Native: transcode falhou ("${url}"): ${String(e)}`);
    }
  }
  const decoded = (g['__cortexTranscodeKtx2'] as NativeKtx2Fn)(bytes);
  if (!decoded) throw new Error(`loadKtx2Native: transcode falhou ("${url}")`);
  return decoded;
}

/** Marca, em `userData`, as texturas BC7 montadas por {@link loadKtx2Native}. */
export const NATIVE_KTX2_FLAG = 'cortexNativeKtx2';

/**
 * Solta os dados em CPU dos mips KTX2 nativos de `root` depois que a GPU os
 * recebe (SPEC-0286). O GLTFLoader cria um clone da textura por material e os
 * clones compartilham os objetos de mip; por isso os dados só somem quando
 * TODAS as texturas que apontam pro mesmo mip já subiram. Textura nunca
 * desenhada mantém os dados (ainda pode subir depois).
 *
 * Depois de liberada, a textura não pode ser reenviada (`needsUpdate`).
 */
export function releaseKtx2DataAfterUpload(root: Object3D): void {
  const groups = new Map<object, Set<CompressedTexture>>();
  root.traverse((child) => {
    const materials = (child as Mesh).material;
    if (!materials) return;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        const texture = value as CompressedTexture | null;
        if (!texture?.isCompressedTexture || texture.userData[NATIVE_KTX2_FLAG] !== true) continue;
        const firstMip = texture.mipmaps[0] as object | undefined;
        if (!firstMip) continue;
        let group = groups.get(firstMip);
        if (!group) groups.set(firstMip, (group = new Set()));
        group.add(texture);
      }
    }
  });
  for (const group of groups.values()) {
    const pending = new Set(group);
    for (const texture of group) {
      const previous = texture.onUpdate;
      texture.onUpdate = (updated: Texture) => {
        previous?.(updated);
        pending.delete(texture);
        if (pending.size > 0) return;
        for (const mip of texture.mipmaps as unknown as { data: Uint8Array | null }[]) mip.data = null;
      };
    }
  }
}

/** `true` no host CortexNative (o transcoder nativo está disponível). */
export function hasNativeKtx2(): boolean {
  return typeof (globalThis as Record<string, unknown>)['__cortexTranscodeKtx2'] === 'function';
}

/**
 * Baixa o `.ktx2`, transcoda no host (basis_universal — num worker quando o host
 * expõe `__cortexTranscodeKtx2Async`, SPEC-0287) e monta a textura (BC7
 * `CompressedTexture` ou `DataTexture` RGBA). `flipY = false` (raster top-down
 * do KTX2). `colorSpace` fica no default — o chamador define (ex.: `SRGBColorSpace` p/ cor), igual ao `TextureLoader`.
 */
export async function loadKtx2Native(url: string): Promise<Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`loadKtx2Native: não achei "${url}" (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const decoded = await transcodeNative(bytes, url);

  // ── BC7 comprimido, com a cadeia de mips do próprio .ktx2 (SPEC-0155) ──────
  // 4× menos VRAM que RGBA cru e paridade com o Studio (KTX2Loader → BC7).
  if (decoded.format === 'bc7' && decoded.levels && decoded.levels.length > 0) {
    const mipmaps = decoded.levels.map((buf, i) => ({
      data: new Uint8Array(buf),
      width: Math.max(1, decoded.width >> i),
      height: Math.max(1, decoded.height >> i),
    }));
    const tex = new CompressedTexture(
      mipmaps as unknown as ImageData[],
      decoded.width,
      decoded.height,
      RGBA_BPTC_Format,
      UnsignedByteType,
    );
    tex.flipY = false;
    tex.minFilter = mipmaps.length > 1 ? LinearMipmapLinearFilter : LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false; // GPU não gera mips de formato comprimido
    tex.userData[NATIVE_KTX2_FLAG] = true;
    tex.needsUpdate = true;
    return tex;
  }

  // ── Fallback RGBA32 (host antigo ou arquivo fora do caminho BC7) ───────────
  const tex = new DataTexture(
    new Uint8Array(decoded.rgba!),
    decoded.width,
    decoded.height,
    RGBAFormat,
    UnsignedByteType,
  );
  tex.flipY = false;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Carrega uma textura `.ktx2` com o transcoder do ambiente atual.
 */
export async function loadKtx2(url: string): Promise<Texture> {
  return hasNativeKtx2() ? loadKtx2Native(url) : loadKtx2Browser(url);
}

/**
 * Loader de KTX2 no formato que o `GLTFLoader` do three espera (`setKTX2Loader`)
 * — carrega as texturas **embutidas em GLB** (`KHR_texture_basisu`). O
 * `GLTFLoader` passa uma URL `blob:` (bytes do bufferView), o mesmo mecanismo
 * que já carrega PNG embutido no host (M1) e no navegador.
 */
export class CortexKtx2Loader extends Loader {
  constructor(manager?: LoadingManager) {
    super(manager);
  }

  /** Chamado pelo GLTFLoader por textura KTX2. `url` é um `blob:` (bufferView). */
  override load(
    url: string,
    onLoad: (texture: Texture) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): void {
    loadKtx2(url)
      .then((tex) => onLoad(tex))
      .catch((e) => onError?.(e));
  }
}
