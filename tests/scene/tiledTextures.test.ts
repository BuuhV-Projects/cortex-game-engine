/**
 * SPEC-0757 — o cache de textura ladrilhada (camada do terreno e estrada): uma textura por URL, o `configure` uma vez,
 * cargas juntas divididas, a falha fora do cache, o `clear` e, no host com o manifesto, o `.ktx2` cozido. O host é
 * simulado pelo `hasNativeKtx2`, o `loadKtx2` é mockado e o `fetch` do manifesto é um stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

const h = vi.hoisted(() => ({
  loadKtx2: vi.fn<(url: string) => Promise<unknown>>(),
  native: { value: false },
}));
vi.mock('../../src/core/loadKtx2.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/loadKtx2.js')>()),
  hasNativeKtx2: () => h.native.value,
  loadKtx2: h.loadKtx2,
}));

const { tiledTextureCache } = await import('../../src/scene/tiledTextures.js');
const { resetCookedTextures } = await import('../../src/scene/cookedTextures.js');

const SIDE = 8;
const BC7_BLOCK_BYTES = 16;

function fakeBc7(): THREE.CompressedTexture {
  const mip = { data: new Uint8Array(BC7_BLOCK_BYTES * 4), width: SIDE, height: SIDE };
  return new THREE.CompressedTexture([mip] as unknown as ImageData[], SIDE, SIDE, THREE.RGBA_BPTC_Format);
}

const fetchMock = vi.fn();
let original: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetCookedTextures();
  h.native.value = false;
  h.loadKtx2.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  original = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new THREE.Texture());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tiledTextureCache (SPEC-0757)', () => {
  it('carrega uma vez por URL e roda o configure uma vez', async () => {
    const configure = vi.fn((t: THREE.Texture) => { t.wrapS = THREE.RepeatWrapping; });
    const cache = tiledTextureCache(configure);
    const [a, b] = await Promise.all([cache.get('assets/a.png'), cache.get('assets/a.png')]);
    const c = await cache.get('assets/a.png');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(original).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledTimes(1);
    expect(a.wrapS).toBe(THREE.RepeatWrapping);
    await cache.get('assets/b.png');
    expect(original).toHaveBeenCalledTimes(2);
  });

  it('a carga que falha sai do cache e a próxima tenta de novo', async () => {
    const cache = tiledTextureCache(() => {});
    original.mockRejectedValueOnce(new Error('404'));
    await expect(cache.get('assets/a.png')).rejects.toThrow('404');
    await expect(cache.get('assets/a.png')).resolves.toBeInstanceOf(THREE.Texture);
    expect(original).toHaveBeenCalledTimes(2);
  });

  it('o clear descarta as texturas e a URL volta a carregar', async () => {
    const cache = tiledTextureCache(() => {});
    const tex = await cache.get('assets/a.png');
    const dispose = vi.spyOn(tex, 'dispose');
    cache.clear();
    expect(dispose).toHaveBeenCalled();
    expect(await cache.get('assets/a.png')).not.toBe(tex);
  });

  it('a carga que chega depois do clear é descartada e não entra no cache', async () => {
    let arrive: (t: THREE.Texture) => void = () => {};
    const late = new THREE.Texture();
    const dispose = vi.spyOn(late, 'dispose');
    original.mockImplementationOnce(() => new Promise<THREE.Texture>((r) => { arrive = r; }));
    const cache = tiledTextureCache(() => {});
    const pending = cache.get('assets/a.png');
    cache.clear();
    await new Promise((r) => setTimeout(r, 0)); // a carga só pede o original depois de ler o manifesto
    arrive(late);
    await expect(pending).rejects.toThrow('clear()');
    expect(dispose).toHaveBeenCalled();
    expect(await cache.get('assets/a.png')).not.toBe(late);
  });

  it('no host com o manifesto, carrega o .ktx2 cozido no lugar do original', async () => {
    h.native.value = true;
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ 'assets/a.png': 'assets/a.png.ktx2' }) });
    const bc7 = fakeBc7();
    h.loadKtx2.mockResolvedValue(bc7);
    const configure = vi.fn();
    const tex = await tiledTextureCache(configure).get('assets/a.png');
    expect(tex).toBe(bc7);
    expect(h.loadKtx2).toHaveBeenCalledWith('assets/a.png.ktx2');
    expect(original).not.toHaveBeenCalled();
    expect(configure).toHaveBeenCalledWith(bc7);
  });

  it('no host, a URL fora do manifesto carrega o original', async () => {
    h.native.value = true;
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await tiledTextureCache(() => {}).get('assets/a.png');
    expect(h.loadKtx2).not.toHaveBeenCalled();
    expect(original).toHaveBeenCalledWith('assets/a.png');
  });
});
