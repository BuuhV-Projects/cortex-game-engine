/**
 * Troncos da vegetação sólida no coletor do personagem (SPEC-0674, SPEC-0675): a instância de escala 0 — o vão que o
 * `writeInstances` zera — não desenha e não vira tronco na origem.
 */
import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { CharacterSceneCollector, TRUNK_RADIUS } from '../../src/physics/characterCollect.js';

/** Raiz com uma vegetação sólida de instâncias `[x, y, z, rotY, escala]`. */
function rootWith(instances: number[]): Object3D {
  const root = new Object3D();
  const veg = new Object3D();
  veg.userData['cortexSolid'] = true;
  veg.userData['cortexVegetation'] = { getInstances: () => instances, version: 1 };
  root.add(veg);
  return root;
}

describe('CharacterSceneCollector — troncos', () => {
  it('uma instância vira [x, z, raio × escala]', () => {
    const collector = new CharacterSceneCollector();
    collector.collect([rootWith([3, 0, 4, 0, 2])]);
    expect(collector.trunks).toEqual([3, 4, TRUNK_RADIUS * 2]);
  });

  it('instância de escala 0 não vira tronco', () => {
    const collector = new CharacterSceneCollector();
    collector.collect([rootWith([0, 0, 0, 0, 0, 5, 0, 6, 0, 1])]);
    expect(collector.trunks).toEqual([5, 6, TRUNK_RADIUS]);
  });
});
