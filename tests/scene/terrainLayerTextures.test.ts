/**
 * SPEC-0652 — textura de camada do terreno compartilhada por URL: 176 terrenos × 4 camadas relendo e
 * decodificando o mesmo arquivo estouravam o heap do host nativo. SPEC-0757: a carga é assíncrona (o `.ktx2`
 * cozido no host), e a camada trocada antes de a carga chegar não recebe a textura velha.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { Terrain } from '../../src/scene/Terrain.js';
import { clearTerrainLayerTextures } from '../../src/scene/terrainLayerTextures.js';

afterEach(() => {
  clearTerrainLayerTextures();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Deixa as cargas pendentes chegarem. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('texturas de camada do terreno (SPEC-0652, SPEC-0757)', () => {
  it('terrenos com a mesma url carregam a textura uma vez só', async () => {
    vi.stubGlobal('document', {}); // o loadLayerTexture só carrega com DOM
    const load = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
    const a = new Terrain({ size: 10, resolution: 4 });
    const b = new Terrain({ size: 10, resolution: 4 });
    a.layerFor('assets/grama.png');
    b.layerFor('assets/grama.png');
    b.layerFor('assets/terra.png');
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    const texture = await load.mock.results[0]!.value as Texture;
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.userData['cortexCached']).toBe(true);

    // o despejo descarta e a url volta a carregar
    const dispose = vi.spyOn(texture, 'dispose');
    clearTerrainLayerTextures();
    expect(dispose).toHaveBeenCalled();
    new Terrain({ size: 10, resolution: 4 }).layerFor('assets/grama.png');
    await settle();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('a camada trocada antes da carga chegar fica com a textura nova', async () => {
    vi.stubGlobal('document', {});
    const textures = new Map<string, Texture>();
    let releaseOld: () => void = () => {};
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async (url: string) => {
      const tex = new Texture();
      textures.set(url, tex);
      // a primeira (velha) chega por último
      if (url === 'assets/velha.png') await new Promise<void>((r) => { releaseOld = r; });
      return tex;
    });
    const t = new Terrain({ size: 10, resolution: 4 });
    t.setPaint({ layers: [{ url: 'assets/velha.png', repeat: 1 }], size: 2, splat: new Uint8Array(16) });
    t.setPaint({ layers: [{ url: 'assets/nova.png', repeat: 1 }], size: 2, splat: new Uint8Array(16) });
    await settle();
    releaseOld();
    await settle();
    const nodes = (t as unknown as { layerTexNodes: { value: Texture | null }[] }).layerTexNodes;
    expect(nodes[0]!.value).toBe(textures.get('assets/nova.png'));
  });
});
