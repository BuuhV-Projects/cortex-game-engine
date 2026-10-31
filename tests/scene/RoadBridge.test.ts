/**
 * Ponte no nó `road` (SPEC-0631 §3c): o vão tem greide reto entre as cabeceiras e não
 * molda o terreno embaixo; as cabeceiras moldam normalmente.
 */
import { describe, it, expect } from 'vitest';
import { DoubleSide, type Mesh, type MeshStandardMaterial } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { ROAD_LIFT } from '../../src/scene/RoadBuild.js';
import type { Terrain } from '../../src/scene/Terrain.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

const RES = 64;
const SIZE = 128;
const BANK = 10;
const RIVER_HALF = 15;
/** Margens a `BANK` m e um rio (|x| < 15) no fundo, a 0. */
const valley = (): number[] => {
  const n = RES + 1;
  const h: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h.push(Math.abs((i / RES - 0.5) * SIZE) < RIVER_HALF ? 0 : BANK);
  return h;
};

function def(bridge?: [number, number][]): SceneDefinition {
  return {
    version: 1,
    nodes: [
      { type: 'terrain', id: 't', size: SIZE, resolution: RES, heights: valley() },
      { type: 'road', id: 'r', points: [[-60, 0, 0], [-20, 0, 0], [20, 0, 0], [60, 0, 0]], width: 6, talude: 4, maxSlope: 0, smooth: 0, ...(bridge ? { bridge } : {}) },
    ],
  };
}

const terrainOf = (h: Awaited<ReturnType<typeof buildScene>>): Terrain =>
  (h.byId.get('t')!.userData as Record<string, unknown>)['cortexTerrain'] as Terrain;

describe('ponte na estrada', () => {
  it('sem ponte, a pista desce ao rio e aterra o fundo', async () => {
    const h = await buildScene(new Scene(), def());
    const road = h.byId.get('r') as Mesh;
    road.geometry.computeBoundingBox();
    expect(road.geometry.boundingBox!.min.y).toBeLessThan(1);
  });

  it('com ponte, o vão fica reto na altura das margens e o rio não é moldado', async () => {
    const h = await buildScene(new Scene(), def([[1, 2]]));
    const t = terrainOf(h);
    const road = h.byId.get('r') as Mesh;
    road.geometry.computeBoundingBox();
    expect(road.geometry.boundingBox!.min.y).toBeCloseTo(BANK + ROAD_LIFT, 3);
    expect(t.heightAt(0, 0)).toBeCloseTo(0, 5); // fundo do rio intacto sob a ponte
    expect(t.heightAt(-50, 0)).toBeCloseTo(BANK, 5); // margem no greide
    expect((road.material as MeshStandardMaterial).side).toBe(DoubleSide);
    expect((road.userData as Record<string, unknown>)['cortexRoad']).toBe(true);
  });

  it('par inválido é ignorado', async () => {
    const h = await buildScene(new Scene(), def([[2, 1], [0, 9]]));
    const road = h.byId.get('r') as Mesh;
    road.geometry.computeBoundingBox();
    expect(road.geometry.boundingBox!.min.y).toBeLessThan(1);
  });
});
