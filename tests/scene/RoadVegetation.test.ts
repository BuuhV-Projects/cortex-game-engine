/**
 * Árvore não fica na pista (SPEC-0631 §3b): a estrada esconde as instâncias de
 * vegetação do corredor, sem apagar o dado.
 */
import { describe, it, expect } from 'vitest';
import type { InstancedMesh, Object3D } from 'three';
import { Matrix4, Vector3 } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { clearRoadVegetation } from '../../src/scene/RoadBuild.js';
import { RoadCorridor } from '../../src/road/RoadCorridor.js';
import type { Vegetation } from '../../src/scene/Vegetation.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

describe('RoadCorridor', () => {
  it('dentro do raio de qualquer segmento, inclusive nas curvas e pontas', () => {
    const c = new RoadCorridor([{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }], 6);
    expect(c.contains(50, 5.9)).toBe(true);
    expect(c.contains(50, 6.1)).toBe(false);
    expect(c.contains(104, 60)).toBe(true);
    expect(c.contains(-5, 0)).toBe(true); // ponta
    expect(c.contains(-7, 0)).toBe(false);
    expect(c.contains(300, 300)).toBe(false);
  });
});

// Árvores (x, z): na pista, no acostamento livre (4 + 2 = 6 m), logo fora e longe.
const TREES: [number, number][] = [[0, 0], [10, 5.5], [-10, -7], [20, 30]];
const def = (withRoad: boolean): SceneDefinition => ({
  version: 1,
  nodes: [
    { type: 'vegetation', id: 'mata', kind: 'tree', instances: TREES.flatMap(([x, z]) => [x, 0, z, 0, 1]) },
    ...(withRoad ? [{ type: 'road' as const, id: 'r', points: [[-40, 0, 0], [40, 0, 0]] as [number, number, number][], width: 8, clearance: 2 }] : []),
  ],
});

const vegOf = (o: Object3D): Vegetation => (o.userData as Record<string, unknown>)['cortexVegetation'] as Vegetation;
/** Escala desenhada de cada instância (0 = escondida). */
function drawnScales(o: Object3D): number[] {
  let inst: InstancedMesh | null = null;
  o.traverse((c) => { if ((c as InstancedMesh).isInstancedMesh && !inst) inst = c as InstancedMesh; });
  const m = new Matrix4();
  const s = new Vector3();
  return TREES.map((_, i) => {
    inst!.getMatrixAt(i, m);
    return Math.round(s.setFromMatrixScale(m).x * 100) / 100;
  });
}

describe('vegetação no corredor da estrada', () => {
  it('esconde só as árvores da pista + faixa livre, sem apagar o dado', async () => {
    const h = await buildScene(new Scene(), def(true));
    const mata = h.byId.get('mata')!;
    const scales = drawnScales(mata);
    expect(scales[0]).toBe(0); // no eixo
    expect(scales[1]).toBe(0); // a 5,5 m (dentro de 4 + 2)
    expect(scales[2]).toBeGreaterThan(0); // a 7 m
    expect(scales[3]).toBeGreaterThan(0); // longe
    expect(vegOf(mata).count).toBe(TREES.length); // o dado continua com todas
  });

  it('sem estrada (apagada), as árvores voltam', async () => {
    const scene = new Scene();
    const h = await buildScene(scene, def(true));
    const road = h.byId.get('r')!;
    road.parent!.remove(road);
    clearRoadVegetation(scene.getThreeScene());
    expect(drawnScales(h.byId.get('mata')!).every((v) => v > 0)).toBe(true);
  });
});
