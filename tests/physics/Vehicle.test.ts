/**
 * Testes do Vehicle (src/physics/RapierPhysics.ts) — raycast vehicle do Rapier (ADR-0081).
 * Rapier inicializa o WASM em node. updateVehicle ANTES do step (convenção do Rapier).
 */
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';

function makeVehicle(phys: RapierPhysics) {
  return phys.createVehicle({
    position: { x: 0, y: 1, z: 0 },
    chassisHalfExtents: { x: 1, y: 0.4, z: 2 },
    wheels: [
      { position: { x: -0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
      { position: { x: 0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
      { position: { x: -0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
      { position: { x: 0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
    ],
  });
}

describe('Vehicle (Rapier raycast)', () => {
  it('assenta no chão pela suspensão (não cai através) e anda com o motor', async () => {
    const phys = await RapierPhysics.create();
    phys.addBody({
      type: 'fixed',
      position: { x: 0, y: -0.5, z: 0 },
      shape: { kind: 'box', halfExtents: { x: 50, y: 0.5, z: 50 } },
    });
    const veh = makeVehicle(phys);

    for (let i = 0; i < 120; i++) { veh.update(1 / 60); phys.step(); } // assenta ~2s
    const restY = veh.chassisTranslation().y;
    expect(restY).toBeGreaterThan(0); // suspensão segura acima do chão (não atravessou)
    expect(restY).toBeLessThan(1.2); // assentou (não ficou no y=1 inicial)

    const z0 = veh.chassisTranslation().z;
    veh.setEngineForce(3000); // acelera
    for (let i = 0; i < 120; i++) { veh.update(1 / 60); phys.step(); }
    expect(Math.abs(veh.chassisTranslation().z - z0)).toBeGreaterThan(0.5); // andou

    const p = new Vector3();
    const q = new Quaternion();
    veh.wheelTransform(0, p, q);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);

    phys.dispose();
  });

  it('apoia num chão TRIMESH (addTrimesh) — pro terreno virar collider', async () => {
    const phys = await RapierPhysics.create();
    // quad plano 100×100 em y=0 (2 triângulos)
    const verts = new Float32Array([-50, 0, -50, 50, 0, -50, 50, 0, 50, -50, 0, 50]);
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3]);
    phys.addTrimesh(verts, idx);
    const veh = makeVehicle(phys);
    for (let i = 0; i < 120; i++) { veh.update(1 / 60); phys.step(); }
    const y = veh.chassisTranslation().y;
    expect(y).toBeGreaterThan(0); // apoiou no trimesh (não atravessou)
    expect(y).toBeLessThan(1.2);
    phys.dispose();
  });
});
