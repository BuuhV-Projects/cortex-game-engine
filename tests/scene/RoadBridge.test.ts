/**
 * Ponte no nó `road` (SPEC-0631 §3c): o vão tem greide reto entre as cabeceiras e não
 * molda o terreno embaixo; as cabeceiras moldam normalmente.
 */
import { describe, it, expect } from 'vitest';
import { DoubleSide, type Mesh, type MeshStandardMaterial } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { ROAD_LIFT } from '../../src/scene/RoadBuild.js';
import { moldHeightfield } from '../../src/road/RoadGrade.js';
import type { Terrain } from '../../src/scene/Terrain.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

const RES = 64;
const SIZE = 128;
const BANK = 10;
const RIVER_HALF = 15;
const HUMP = 14;
/**
 * Margens a `BANK` m e um rio (|x| < 15) no fundo, a 0. Com `hump`, um rochedo a `HUMP` m
 * no meio do vão (x de −9 a −6), longe das cabeceiras: só a regra do vão o alcança.
 */
const valley = (hump = false): number[] => {
  const n = RES + 1;
  const h: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / RES - 0.5) * SIZE;
      h.push(hump && x > -9 && x < -6 ? HUMP : Math.abs(x) < RIVER_HALF ? 0 : BANK);
    }
  }
  return h;
};

function def(bridge?: [number, number][], hump = false): SceneDefinition {
  return {
    version: 1,
    nodes: [
      { type: 'terrain', id: 't', size: SIZE, resolution: RES, heights: valley(hump) },
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

  it('encosta acima da pista dentro do vão é cortada até o greide (ponte não fica enterrada)', async () => {
    const h = await buildScene(new Scene(), def([[1, 2]], true));
    const t = terrainOf(h);
    expect(t.baseHeightAt(-8, 0)).toBeCloseTo(HUMP, 5);
    expect(t.heightAt(-8, 0)).toBeCloseTo(BANK, 3);
    expect(t.heightAt(0, 0)).toBeCloseTo(0, 5); // o rio continua sem aterro
  });

  it('logo depois da cabeceira, com a pista descendo, o terreno fica abaixo dela (a ponta do acesso não invade o vão)', () => {
    const res = 40;
    const grid = { width: 80, depth: 80, resolution: res, base: new Array<number>((res + 1) ** 2).fill(BANK) };
    // Acesso plano a 10; vão de x = 0 a 20 descendo para 6.
    const line = [{ x: -20, z: 0, y: BANK }, { x: 0, z: 0, y: BANK, bridge: true }, { x: 20, z: 0, y: 6, bridge: true }];
    const delta = moldHeightfield(grid, line, 3, 4);
    const at = (x: number): number => BANK + delta[(res / 2) * (res + 1) + (x / 80 + 0.5) * res]!;
    expect(at(4)).toBeCloseTo(BANK - (4 * 4) / 20, 4); // no greide do vão (9,2), não no platô do acesso (10)
    expect(at(-4)).toBeCloseTo(BANK, 4);
  });
});
