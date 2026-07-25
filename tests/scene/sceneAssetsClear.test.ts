/**
 * SPEC-0152 — `clearSceneAssetCaches()` do SceneAssets: despeja os caches de
 * módulo (GLTF + textura), dispõe os recursos cacheados, delega ao
 * `disposeCache()` do loader interno e aciona o hook do host
 * `__cortexClearObjectUrls` (ADR-0153). O AssetLoader é mockado (carregar de
 * verdade exigiria rede); `disposeObjectResources` continua o real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

const h = vi.hoisted(() => ({
  loadGLTF: vi.fn<(url: string) => Promise<unknown>>(),
  loadTexture: vi.fn<(url: string) => Promise<unknown>>(),
  disposeCache: vi.fn(),
}));

vi.mock('../../src/core/AssetLoader.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/AssetLoader.js')>();
  class FakeAssetLoader {
    loadGLTF = h.loadGLTF;
    loadTexture = h.loadTexture;
    disposeCache = h.disposeCache;
  }
  return { ...mod, AssetLoader: FakeAssetLoader };
});

// Import DEPOIS do mock: o `_loader` de módulo nasce da classe mockada.
const { loadGLB, loadTexture, clearSceneAssetCaches } = await import('../../src/scene/SceneAssets.js');

function fakeGltf() {
  const geo = new THREE.BufferGeometry();
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
  return { gltf: { scene, animations: [] }, geo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSceneAssetCaches(); // não deixa cache vazar ENTRE testes (irônico se deixasse)
});

describe('clearSceneAssetCaches (SPEC-0152)', () => {
  it('despeja o cache de GLTF: dispõe a geometria e a URL volta a carregar', async () => {
    const { gltf, geo } = fakeGltf();
    const geoDispose = vi.spyOn(geo, 'dispose');
    h.loadGLTF.mockResolvedValue(gltf);

    await loadGLB('kit/piece.glb');
    await loadGLB('kit/piece.glb');
    expect(h.loadGLTF).toHaveBeenCalledTimes(1); // cache em ação

    clearSceneAssetCaches();
    expect(geoDispose).toHaveBeenCalled();
    expect(h.disposeCache).toHaveBeenCalledTimes(1); // delega ao loader interno

    await loadGLB('kit/piece.glb');
    expect(h.loadGLTF).toHaveBeenCalledTimes(2); // cache realmente esvaziou
  });

  it('despeja o cache de textura com dispose()', async () => {
    const tex = new THREE.Texture();
    const texDispose = vi.spyOn(tex, 'dispose');
    h.loadTexture.mockResolvedValue(tex);

    await loadTexture('hero.png');
    clearSceneAssetCaches();

    expect(texDispose).toHaveBeenCalled();
    await loadTexture('hero.png');
    expect(h.loadTexture).toHaveBeenCalledTimes(2);
  });

  it('aciona o hook __cortexClearObjectUrls do host quando existir', () => {
    const clearUrls = vi.fn();
    vi.stubGlobal('__cortexClearObjectUrls', clearUrls);
    clearSceneAssetCaches();
    expect(clearUrls).toHaveBeenCalledTimes(1);
  });

  it('sem o hook (browser) não quebra', () => {
    expect(() => clearSceneAssetCaches()).not.toThrow();
  });
});
