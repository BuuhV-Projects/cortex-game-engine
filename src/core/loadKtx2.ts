/**
 * Carregamento de texturas **KTX2 / Basis** (ADR-0108) com dois caminhos, mesma
 * API — igual à UI de runtime (ADR-0102):
 * - **Host nativo** (CortexNative): `__cortexTranscodeKtx2` (basis_universal em
 *   C++) → `DataTexture` RGBA. Hermes não roda WASM, então o `KTX2Loader` do
 *   three não serve lá.
 * - **Browser / Studio**: `KTX2Loader` do three (transcoder Basis em WASM).
 *
 * KTX2 (Basis ETC1S/UASTC) é ~4–8× menor que PNG em disco — encolhe o `.pak` do
 * export. Fase 1: transcode pra RGBA (reusa o upload que já existe). Fase 2
 * (futura) transcodará direto pros formatos de bloco da GPU (BC7) p/ ganho de
 * VRAM. Ver ADR-0108.
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
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

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
 * Caminho NATIVO: baixa o `.ktx2`, transcoda no host (basis_universal) e monta
 * uma `DataTexture` RGBA. `flipY = false` (raster top-down do KTX2, igual à
 * convenção do `KTX2Loader` do three). `colorSpace` fica no default — o chamador
 * define (ex.: `SRGBColorSpace` p/ cor), igual ao `TextureLoader`.
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

// ── Caminho browser: KTX2Loader do three (WASM), preguiçoso + configurável ────
let _transcoderPath = 'basis/'; // onde os basis_transcoder.js/.wasm são servidos
let _ktx2Loader: KTX2Loader | null = null;

/**
 * Define onde o `KTX2Loader` do three acha o transcoder Basis (WASM) no
 * **browser/Studio**. Copie `three/examples/jsm/libs/basis/*` pra esse caminho
 * servido. No host nativo é ignorado (usa o transcoder C++). Default: `"basis/"`.
 */
export function setKtx2TranscoderPath(path: string): void {
  _transcoderPath = path;
  _ktx2Loader = null; // recria com o caminho novo
}

function browserKtx2Loader(renderer?: unknown): KTX2Loader {
  if (!_ktx2Loader) {
    _ktx2Loader = new KTX2Loader().setTranscoderPath(_transcoderPath);
    const r = renderer as { isRenderer?: boolean } | undefined;
    if (r) (_ktx2Loader as unknown as { detectSupport(x: unknown): void }).detectSupport(r);
  }
  return _ktx2Loader;
}

/**
 * Carrega uma textura **KTX2** escolhendo o transcoder do ambiente:
 * - host nativo → {@link loadKtx2Native} (basis_universal em C++);
 * - browser/Studio → `KTX2Loader` do three (WASM). Passe o `renderer` p/
 *   `detectSupport` — sem ele cai pra RGBA32 (ok na Fase 1, que já é RGBA).
 *
 * Use direto pra `.ktx2`; pra "qualquer textura" o ponto único é o
 * `loadTexture` do `SceneAssets` (que chama este quando a URL é `.ktx2`).
 *
 * @param renderer o `WebGPURenderer`/`WebGLRenderer` (só no caminho browser).
 */
export async function loadKtx2(url: string, renderer?: unknown): Promise<Texture> {
  return hasNativeKtx2() ? loadKtx2Native(url) : browserKtx2Loader(renderer).loadAsync(url);
}

// Renderer p/ o `detectSupport` do caminho browser das texturas de GLB (o
// KTX2Loader do three exige um renderer antes de carregar). No host nativo é
// ignorado. O `Game`/`buildScene` chama `setKtx2Renderer(renderer)` no boot.
let _renderer: unknown = null;
export function setKtx2Renderer(renderer: unknown): void {
  _renderer = renderer;
}

/**
 * Loader de KTX2 no formato que o `GLTFLoader` do three espera
 * (`setKTX2Loader`) — carrega as texturas **embutidas em GLB** (extensão
 * `KHR_texture_basisu`). Dois caminhos, escolhidos por ambiente (ADR-0108):
 * - host nativo → transcoder C++ ({@link loadKtx2Native}), sem renderer;
 * - browser/Studio → `KTX2Loader` do three (WASM), com `detectSupport` do
 *   renderer registrado em {@link setKtx2Renderer}.
 *
 * O `GLTFLoader` passa uma URL `blob:` (bytes da textura no bufferView) — o
 * mesmo mecanismo que já carrega PNG embutido no host (M1).
 */
export class CortexKtx2Loader extends Loader {
  private _browser: KTX2Loader | null = null;

  constructor(manager?: LoadingManager) {
    super(manager);
  }

  private browser(): KTX2Loader {
    if (!this._browser) {
      this._browser = new KTX2Loader(this.manager).setTranscoderPath(_transcoderPath);
      if (_renderer) (this._browser as unknown as { detectSupport(r: unknown): void }).detectSupport(_renderer);
    }
    return this._browser;
  }

  /** Chamado pelo GLTFLoader por textura KTX2. `url` é um `blob:` (bufferView). */
  override load(
    url: string,
    onLoad: (texture: Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): void {
    if (hasNativeKtx2()) {
      loadKtx2Native(url)
        .then((tex) => onLoad(tex))
        .catch((e) => onError?.(e));
      return;
    }
    this.browser().load(url, onLoad, onProgress, onError);
  }

  dispose(): this {
    this._browser?.dispose();
    return this;
  }
}
