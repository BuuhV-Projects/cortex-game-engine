/**
 * Carregamento de texturas **KTX2 / Basis** (ADR-0108) no host CortexNative.
 *
 * O KTX2 é comprimido (~4–8× menor que PNG em disco) e é o formato dos assets
 * **cozidos no export** (a pasta `assets/` fonte fica PNG; o `export-game.mjs`
 * converte pro pak). No host, `__cortexTranscodeKtx2` (basis_universal em C++)
 * decodifica pra RGBA — o Hermes não roda WASM, então o `KTX2Loader` do three
 * não serve aqui.
 *
 * **Escopo:** só o caminho NATIVO. No Studio o jogo carrega os assets FONTE
 * (PNG), então não precisa de KTX2 lá. Um export **web** (fora do escopo do
 * PRD-0004) precisaria do `KTX2Loader`/WASM — reintroduzir se/quando for o caso.
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
  type Texture,
} from 'three';

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

/** `true` no host CortexNative (o transcoder nativo está disponível). */
export function hasNativeKtx2(): boolean {
  return typeof (globalThis as Record<string, unknown>)['__cortexTranscodeKtx2'] === 'function';
}

/**
 * Baixa o `.ktx2`, transcoda no host (basis_universal) e monta uma `DataTexture`
 * RGBA. `flipY = false` (raster top-down do KTX2). `colorSpace` fica no default —
 * o chamador define (ex.: `SRGBColorSpace` p/ cor), igual ao `TextureLoader`.
 */
export async function loadKtx2Native(url: string): Promise<Texture> {
  const transcode = (globalThis as Record<string, unknown>)['__cortexTranscodeKtx2'] as NativeKtx2Fn;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`loadKtx2Native: não achei "${url}" (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const decoded = transcode(bytes);
  if (!decoded) throw new Error(`loadKtx2Native: transcode falhou ("${url}")`);

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
 * Carrega uma textura `.ktx2` (só no host nativo). Lança se não houver
 * transcoder — no Studio use os assets FONTE (PNG), não KTX2.
 */
export async function loadKtx2(url: string): Promise<Texture> {
  if (!hasNativeKtx2()) {
    throw new Error(`loadKtx2: KTX2 só é suportado no host nativo (use PNG no Studio) — "${url}"`);
  }
  return loadKtx2Native(url);
}

/**
 * Loader de KTX2 no formato que o `GLTFLoader` do three espera (`setKTX2Loader`)
 * — carrega as texturas **embutidas em GLB** (`KHR_texture_basisu`) no host. O
 * `GLTFLoader` passa uma URL `blob:` (bytes do bufferView), o mesmo mecanismo
 * que já carrega PNG embutido no host (M1). Só caminho nativo — ver escopo no
 * topo do módulo.
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
    if (!hasNativeKtx2()) {
      onError?.(new Error('CortexKtx2Loader: KTX2 em GLB só no host nativo (use PNG no Studio)'));
      return;
    }
    loadKtx2Native(url)
      .then((tex) => onLoad(tex))
      .catch((e) => onError?.(e));
  }
}
