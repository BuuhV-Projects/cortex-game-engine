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
  DataTexture,
  RGBAFormat,
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
  rgba: ArrayBuffer;
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
export async function loadKtx2Native(url: string): Promise<DataTexture> {
  const transcode = (globalThis as Record<string, unknown>)['__cortexTranscodeKtx2'] as NativeKtx2Fn;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`loadKtx2Native: não achei "${url}" (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const decoded = transcode(bytes);
  if (!decoded) throw new Error(`loadKtx2Native: transcode falhou ("${url}")`);
  const tex = new DataTexture(
    new Uint8Array(decoded.rgba),
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
