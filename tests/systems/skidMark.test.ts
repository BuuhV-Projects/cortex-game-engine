/**
 * SkidMarkSystem — marcas de pneu ao derrapar/frear (ADR-0081). Lê o contato das rodas
 * do Vehicle (Rapier/WASM) e acumula segmentos numa malha (ring buffer).
 */
import { describe, it, expect } from 'vitest';
import { Group, type Mesh } from 'three';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';
import { SkidMarkSystem } from '../../src/systems/SkidMarkSystem.js';

describe('SkidMarkSystem', () => {
  it('acumula segmentos quando o carro derrapa em movimento (e clear() apaga)', async () => {
    const phys = await RapierPhysics.create();
    phys.addBody({
      type: 'fixed', position: { x: 0, y: -0.5, z: 0 },
      shape: { kind: 'box', halfExtents: { x: 50, y: 0.5, z: 50 } },
    });
    const veh = phys.createVehicle({
      position: { x: 0, y: 1, z: 0 },
      chassisHalfExtents: { x: 1, y: 0.4, z: 2 },
      wheels: [
        { position: { x: -0.9, y: -0.2, z: 1.4 }, radius: 0.4, steering: true, powered: true },
        { position: { x: 0.9, y: -0.2, z: 1.4 }, radius: 0.4, steering: true, powered: true },
        { position: { x: -0.9, y: -0.2, z: -1.4 }, radius: 0.4, powered: true },
        { position: { x: 0.9, y: -0.2, z: -1.4 }, radius: 0.4, powered: true },
      ],
    });
    for (let i = 0; i < 60; i++) { veh.update(1 / 60); phys.step(); } // assenta

    const root = new Group();
    const skid = new SkidMarkSystem(veh, root, { skidding: () => true, minSpeed: 0.5 });
    expect(root.children.length).toBe(1); // a malha de marcas
    const mesh = root.children[0] as Mesh;
    expect(mesh.geometry.drawRange.count).toBe(0);

    veh.setEngineForce(4000); // anda + skidding forçado → marca
    for (let i = 0; i < 60; i++) { veh.update(1 / 60); phys.step(); skid.update([], 16); }
    expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);

    skid.clear();
    expect(mesh.geometry.drawRange.count).toBe(0);
    phys.dispose();
  });
});
