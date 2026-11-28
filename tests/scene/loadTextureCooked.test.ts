/**
 * O `loadTexture` com as imagens soltas cozidas (SPEC-0755): no host, a URL que
 * está no manifesto `assets/cooked-textures.json` carrega pelo `.ktx2` (a
 * `CompressedTexture` BC7), com o `pixelated` valendo, o cache pela URL original
 * e os dados BC7 soltos depois do primeiro upload; sem o manifesto (ou no
 * navegador), o PNG. O host é simulado pelo `hasNativeKtx2` e o `loadKtx2` é
 * mockado; o `fetch` do manifesto é um stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

const h = vi.hoisted(() => ({
  loadTexture: vi.fn<(url: string) => Promise<unknown>>(),
  loadKtx2: vi.fn<(url: string) => Promise<unknown>>(),
  native: { value: true },
}));

vi.mock('../../src/core/AssetLoader.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/AssetLoader.js')>();
  class FakeAssetLoader {
    loadTexture = h.loadTexture;
    loadGLTF = vi.fn();
    disposeCache = vi.fn();
  }
  return { ...mod, AssetLoader: FakeAssetLoader };
});
vi.mock('../../src/core/loadKtx2.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/loadKtx2.js')>()),
  hasNativeKtx2: () => h.native.value,
  loadKtx2: h.loadKtx2,
}));

const { loadTexture, clearSceneAssetCaches } = await import('../../src/scene/SceneAssets.js');
const { cookedTextureUrl, resetCookedTextures, COOKED_TEXTURES_MANIFEST_URL } = await import(
  '../../src/scene/cookedTextures.js'
);
const { NATIVE_KTX2_FLAG } = await import('../../src/core/loadKtx2.js');

const SIDE = 8;
const BC7_BLOCK_BYTES = 16;
const MANIFEST = { 'assets/sky/day.png': 'assets/sky/day.png.ktx2' };

/** Uma BC7 como a do `loadKtx2Native`: mips com dados e a marca de textura nativa. */
function fakeBc7(): THREE.CompressedTexture {
  const mip = { data: new Uint8Array(BC7_BLOCK_BYTES * 4), width: SIDE, height: SIDE };
  const half = { data: new Uint8Array(BC7_BLOCK_BYTES), width: SIDE / 2, height: SIDE / 2 };
  const tex = new THREE.CompressedTexture([mip, half] as unknown as ImageData[], SIDE, SIDE, THREE.RGBA_BPTC_Format);
  tex.flipY = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData[NATIVE_KTX2_FLAG] = true;
  return tex;
}

const fetchMock = vi.fn();
function serveManifest(body: unknown, ok = true): void {
  fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.native.value = true;
  vi.stubGlobal('fetch', fetchMock);
  h.loadKtx2.mockImplementation(async () => fakeBc7());
  h.loadTexture.mockImplementation(async () => new THREE.Texture());
});
afterEach(() => {
  clearSceneAssetCaches();
  resetCookedTextures();
  vi.unstubAllGlobals();
});

describe('loadTexture — imagens soltas cozidas (SPEC-0755)', () => {
  it('com a URL no manifesto, carrega o .ktx2 e devolve a CompressedTexture', async () => {
    serveManifest(MANIFEST);

    const tex = await loadTexture('assets/sky/day.png', false);

    expect(fetchMock).toHaveBeenCalledWith(COOKED_TEXTURES_MANIFEST_URL);
    expect(h.loadKtx2).toHaveBeenCalledWith('assets/sky/day.png.ktx2');
    expect(h.loadTexture).not.toHaveBeenCalled();
    expect((tex as THREE.CompressedTexture).isCompressedTexture).toBe(true);
    expect(tex.flipY).toBe(false);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
  });

  it('o pixelated continua valendo: nearest', async () => {
    serveManifest(MANIFEST);

    const tex = await loadTexture('assets/sky/day.png');

    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.minFilter).toBe(THREE.NearestFilter);
    // um nível só, como o PNG pixelado: a cadeia do arquivo faria o WebGPU amostrar os mips menores
    expect((tex as THREE.CompressedTexture).mipmaps).toHaveLength(1);
  });

  it('depois do upload, needsUpdate vira no-op (os dados saíram da CPU); antes, sobe normal', async () => {
    serveManifest(MANIFEST);

    const tex = (await loadTexture('assets/sky/day.png', false)) as THREE.CompressedTexture;
    const before = tex.version;
    tex.needsUpdate = true; // antes do primeiro upload: o jogo ajusta flipY/colorSpace e marca
    expect(tex.version).toBe(before + 1);
    tex.onUpdate?.(tex);
    tex.needsUpdate = true; // a segunda carga da mesma URL pelo cache
    expect(tex.version).toBe(before + 1);
  });

  it('solta os dados BC7 da CPU depois do primeiro upload', async () => {
    serveManifest(MANIFEST);

    const tex = (await loadTexture('assets/sky/day.png', false)) as THREE.CompressedTexture;
    tex.onUpdate?.(tex);

    expect((tex.mipmaps[0] as unknown as { data: Uint8Array | null }).data).toBeNull();
  });

  it('cache pela URL original: a segunda chamada (e a paralela) não carrega de novo', async () => {
    serveManifest(MANIFEST);

    const [a, b] = await Promise.all([loadTexture('assets/sky/day.png'), loadTexture('assets/sky/day.png')]);
    const c = await loadTexture('assets/sky/day.png');

    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(h.loadKtx2).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('URL fora do manifesto carrega o PNG', async () => {
    serveManifest(MANIFEST);

    await loadTexture('assets/ui/logo.png');

    expect(h.loadTexture).toHaveBeenCalledWith('assets/ui/logo.png', { pixelated: true });
    expect(h.loadKtx2).not.toHaveBeenCalled();
  });

  it('sem o manifesto (404) ou com ele inválido, o PNG — lido uma vez só', async () => {
    serveManifest(null, false);
    await loadTexture('assets/sky/day.png');
    await loadTexture('assets/other.png');
    expect(h.loadKtx2).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetCookedTextures();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('json'); } });
    expect(await cookedTextureUrl('assets/sky/day.png')).toBeNull();
    expect(await cookedTextureUrl('assets/sky/day.png')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // o 404 de antes e o JSON ilegível: os dois ficam guardados
  });

  it('a falha transitória do fetch não fica guardada: a próxima chamada lê o manifesto', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('rede'));
    expect(await cookedTextureUrl('assets/sky/day.png')).toBeNull();
    // o fetch que lança na hora (síncrono), antes de a promessa ser guardada
    fetchMock.mockImplementationOnce(() => {
      throw new TypeError('rede síncrona');
    });
    expect(await cookedTextureUrl('assets/sky/day.png')).toBeNull();
    serveManifest(MANIFEST);
    expect(await cookedTextureUrl('assets/sky/day.png')).toBe('assets/sky/day.png.ktx2');
  });

  it('o original que saiu do pak (replace) lê o manifesto de novo antes de falhar', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('rede')); // a 1ª leitura do manifesto falha de passagem
    h.loadTexture.mockImplementationOnce(async () => {
      serveManifest(MANIFEST); // o manifesto volta a responder
      throw new Error('HTTP 404 assets/sky/day.png'); // o PNG não está mais no pak
    });

    const tex = await loadTexture('assets/sky/day.png', false);

    expect(h.loadKtx2).toHaveBeenCalledWith('assets/sky/day.png.ktx2');
    expect((tex as THREE.CompressedTexture).isCompressedTexture).toBe(true);
  });

  it('no navegador nada muda: nem pede o manifesto', async () => {
    h.native.value = false;
    serveManifest(MANIFEST);

    await loadTexture('assets/sky/day.png');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.loadTexture).toHaveBeenCalledWith('assets/sky/day.png', { pixelated: true });
  });
});

describe('cookedTextureUrl', () => {
  it('devolve a URL do .ktx2 (aceita ./ e / na frente) ou null', async () => {
    serveManifest(MANIFEST);

    expect(await cookedTextureUrl('assets/sky/day.png')).toBe('assets/sky/day.png.ktx2');
    expect(await cookedTextureUrl('./assets/sky/day.png')).toBe('assets/sky/day.png.ktx2');
    expect(await cookedTextureUrl('/assets/sky/day.png')).toBe('assets/sky/day.png.ktx2');
    expect(await cookedTextureUrl('assets/ui/logo.png')).toBeNull();
  });

  it('no navegador é sempre null', async () => {
    h.native.value = false;
    serveManifest(MANIFEST);

    expect(await cookedTextureUrl('assets/sky/day.png')).toBeNull();
  });
});
