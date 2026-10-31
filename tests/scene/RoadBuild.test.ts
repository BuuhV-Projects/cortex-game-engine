/**
 * Estrada na cena (SPEC-0631): nó `road` + overlay → pista, corte/aterro não destrutivo
 * nos ladrilhos de terreno e chão do carro.
 */
import { describe, it, expect } from 'vitest';
import type { Mesh } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { overlayRoad, ROAD_LIFT } from '../../src/scene/RoadBuild.js';
import type { Terrain } from '../../src/scene/Terrain.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

const RES = 32;
const SIZE = 64;
const HILL = 12;
/** Ladrilho plano a `HILL` m (um "morro" uniforme). */
const flatHeights = (): number[] => new Array<number>((RES + 1) ** 2).fill(HILL);

function def(extra: Partial<Extract<SceneDefinition['nodes'][number], { type: 'road' }>> = {}): SceneDefinition {
  return {
    version: 1,
    nodes: [
      // Dois ladrilhos lado a lado (X −64..0 e 0..64): a estrada cruza a borda x = 0.
      { type: 'terrain', id: 'tA', size: SIZE, resolution: RES, heights: flatHeights(), transform: { position: [-SIZE / 2, 0, 0] } },
      { type: 'terrain', id: 'tB', size: SIZE, resolution: RES, heights: flatHeights(), transform: { position: [SIZE / 2, 0, 0] } },
      { type: 'road', id: 'r', points: [[-40, 0, 0], [40, 0, 0]], width: 6, talude: 4, grade: 'points', maxSlope: 0, ...extra },
    ],
  };
}

const terrainOf = (h: Awaited<ReturnType<typeof buildScene>>, id: string): Terrain =>
  (h.byId.get(id)!.userData as Record<string, unknown>)['cortexTerrain'] as Terrain;

describe('estrada na cena', () => {
  it('corta os dois ladrilhos até o greide, sem cicatriz na base salva', async () => {
    const h = await buildScene(new Scene(), def());
    const tA = terrainOf(h, 'tA');
    const tB = terrainOf(h, 'tB');
    // Eixo em z = 0, greide = Y dos pontos = 0: os dois lados da borda x = 0 descem a 0.
    expect(tA.heightAt(SIZE / 2 - 2, 0)).toBeCloseTo(0, 4); // tA local x = +30 → mundo −2
    expect(tB.heightAt(-SIZE / 2 + 2, 0)).toBeCloseTo(0, 4);
    // Borda comum (mundo x = 0) igual nos dois ladrilhos, inclusive no talude.
    for (const z of [0, 4, 6, 8]) expect(tA.heightAt(SIZE / 2, z)).toBeCloseTo(tB.heightAt(-SIZE / 2, z)!, 5);
    // Longe da estrada, o morro fica.
    expect(tA.heightAt(0, 25)).toBeCloseTo(HILL, 5);
    // A base (o que o overlay/heightmap salva) não tem o corte.
    expect(tA.getHeights().every((y) => y === HILL)).toBe(true);
    expect(tA.baseHeightAt(SIZE / 2 - 2, 0)).toBeCloseTo(HILL, 5);
  });

  it('a pista é chão do carro, fica no greide + lift, e drivable:false tira a marca', async () => {
    const h = await buildScene(new Scene(), def());
    const road = h.byId.get('r') as Mesh;
    expect((road.userData as Record<string, unknown>)['cortexRoad']).toBe(true);
    road.geometry.computeBoundingBox();
    expect(road.geometry.boundingBox!.max.y).toBeCloseTo(ROAD_LIFT, 5);
    const h2 = await buildScene(new Scene(), def({ drivable: false }));
    expect((h2.byId.get('r')!.userData as Record<string, unknown>)['cortexRoad']).toBeUndefined();
  });

  it('grade "terrain" segue a base do terreno (sem corte num morro plano)', async () => {
    const h = await buildScene(new Scene(), def({ grade: 'terrain', maxSlope: 0.25 }));
    const road = h.byId.get('r') as Mesh;
    road.geometry.computeBoundingBox();
    expect(road.geometry.boundingBox!.min.y).toBeCloseTo(HILL + ROAD_LIFT, 4);
    expect(terrainOf(h, 'tA').heightAt(SIZE / 2 - 2, 0)).toBeCloseTo(HILL, 4);
  });

  it('o overlay data.road vence o nó', async () => {
    const overlay: SceneFileV1 = { version: 1, objects: {}, data: { road: { r: { points: [[-40, 5, 10], [40, 5, 10]] } } } };
    const h = await buildScene(new Scene(), def(), { overlay });
    const tA = terrainOf(h, 'tA');
    expect(tA.heightAt(SIZE / 2 - 2, 10)).toBeCloseTo(5, 4); // eixo do overlay (z = 10, y = 5)
    expect(tA.heightAt(SIZE / 2 - 2, 0)).toBeGreaterThan(5); // o eixo do nó não vale mais
  });

  it('overlayRoad descarta entrada inválida', () => {
    const ov = overlayRoad({ version: 1, objects: {}, data: { road: { a: { width: 4 }, b: { width: -1 } } } });
    expect(Object.keys(ov)).toEqual(['a']);
  });
});
