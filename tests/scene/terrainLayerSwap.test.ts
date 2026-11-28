/**
 * Camada nova do terreno chega ao renderer nativo (SPEC-0662).
 *
 * O que este teste trava: o renderer nativo relê as texturas do material pela versão dele, então trocar
 * a textura de uma camada (`layerFor` depois do primeiro quadro, `setPaint` com outras URLs) precisa marcar
 * `needsUpdate`; repetir a mesma textura não marca (no Studio isso recompilaria o material à toa).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Texture } from 'three';

const textures = new Map<string, Texture>();
vi.mock('../../src/scene/terrainLayerTextures.js', () => ({
  // a carga é assíncrona (SPEC-0757): a mesma textura por URL, numa promessa
  terrainLayerTexture: async (url: string) => textures.get(url) ?? (textures.set(url, new Texture()), textures.get(url)!),
}));

const { Terrain } = await import('../../src/scene/Terrain.js');

describe('Terrain: troca de camada (SPEC-0662)', () => {
  const hadDocument = 'document' in globalThis;
  beforeAll(() => { if (!hadDocument) (globalThis as Record<string, unknown>)['document'] = {}; });
  afterAll(() => { if (!hadDocument) delete (globalThis as Record<string, unknown>)['document']; });

  it('marca o material quando a textura da camada muda, e só então', async () => {
    const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    const t = new Terrain({ size: 10, resolution: 4 });
    t.layerFor('assets/grama.png');
    await settle();
    const material = t.mesh.material as { version: number };
    const before = material.version;
    t.layerFor('assets/terra.png');
    await settle();
    expect(material.version).toBeGreaterThan(before);
    const after = material.version;
    t.layerFor('assets/grama.png'); // reusa a camada 0: mesma textura
    await settle();
    expect(material.version).toBe(after);
  });
});
