/**
 * SPEC-0652 — textura de camada do terreno compartilhada por URL: 176 terrenos × 4 camadas relendo e
 * decodificando o mesmo arquivo estouravam o heap do host nativo.
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

describe('texturas de camada do terreno (SPEC-0652)', () => {
  it('terrenos com a mesma url carregam a textura uma vez só', () => {
    vi.stubGlobal('document', {}); // o loadLayerTexture só carrega com DOM
    const load = vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => new Texture());
    const a = new Terrain({ size: 10, resolution: 4 });
    const b = new Terrain({ size: 10, resolution: 4 });
    a.layerFor('assets/grama.png');
    b.layerFor('assets/grama.png');
    b.layerFor('assets/terra.png');
    expect(load).toHaveBeenCalledTimes(2);
    const texture = load.mock.results[0]!.value as Texture;
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.userData['cortexCached']).toBe(true);

    // o despejo descarta e a url volta a carregar
    const dispose = vi.spyOn(texture, 'dispose');
    clearTerrainLayerTextures();
    expect(dispose).toHaveBeenCalled();
    new Terrain({ size: 10, resolution: 4 }).layerFor('assets/grama.png');
    expect(load).toHaveBeenCalledTimes(3);
  });
});
