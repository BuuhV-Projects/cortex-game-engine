/**
 * O carro roda na estrada (SPEC-0631 §4), com Rapier real: o mesmo caminho do
 * `setupVehicle` — trimesh de tudo que tem `cortexTerrain`/`cortexRoad`.
 */
import { describe, it, expect } from 'vitest';
import type { Object3D } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

const STEP = 1 / 60;
/** O carro cai de 2 m e quica: 6 s pra assentar com as 4 rodas no chão. */
const SETTLE_STEPS = 360;
const DRIVE_STEPS = 180;
const RES = 64;
/** Vale: base do terreno bem abaixo da pista (o corte vira aterro). */
const VALLEY = -6;
const ROAD_Y = 2;
const ENGINE_FORCE = 3000;

const def: SceneDefinition = {
  version: 1,
  nodes: [
    { type: 'terrain', id: 't', size: 128, resolution: RES, heights: new Array<number>((RES + 1) ** 2).fill(VALLEY) },
    { type: 'road', id: 'r', points: [[0, ROAD_Y, -50], [0, ROAD_Y, 50]], width: 8, grade: 'points' },
  ],
};

describe('carro na estrada', () => {
  it('assenta na pista aterrada sobre o vale e anda por ela sem cair', async () => {
    const scene = new Scene();
    await buildScene(scene, def);
    const physics = await RapierPhysics.create();
    scene.getThreeScene().traverse((o: Object3D) => {
      const ud = o.userData as Record<string, unknown>;
      if (ud['cortexTerrain'] || ud['cortexRoad']) physics.addTrimeshFromObject(o);
    });
    const vehicle = physics.createVehicle({
      position: { x: 0, y: ROAD_Y + 2, z: -30 },
      chassisHalfExtents: { x: 1, y: 0.4, z: 2 },
      wheels: [
        { position: { x: -0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
        { position: { x: 0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
        { position: { x: -0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
        { position: { x: 0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
      ],
    });
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) physics.advance(STEP, (dt) => vehicle.update(dt));
    };
    run(SETTLE_STEPS);
    const rest = vehicle.chassisTranslation();
    expect(rest.y).toBeGreaterThan(ROAD_Y); // em cima da pista, não no vale (−6)
    expect(rest.y).toBeLessThan(ROAD_Y + 2);
    expect([0, 1, 2, 3].every((i) => vehicle.wheelIsInContact(i))).toBe(true);

    vehicle.setEngineForce(ENGINE_FORCE);
    run(DRIVE_STEPS);
    const moved = vehicle.chassisTranslation();
    expect(Math.abs(moved.z - rest.z)).toBeGreaterThan(5); // andou ao longo da pista
    expect(moved.y).toBeGreaterThan(ROAD_Y); // continua em cima
  });
});
