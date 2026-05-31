/**
 * Testes do VehicleGravitySystem (src/physics/VehicleGravitySystem.ts).
 *
 * Mocka `THREE.Raycaster` pra controlar os hits sem WebGL/cena real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hits retornados pelo raycaster mockado — ajustados por teste.
let mockHits: Array<{ point: { y: number } }> = [];

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockRaycaster {
    far = 0;
    set(): void {}
    intersectObject(): Array<{ point: { y: number } }> {
      return mockHits;
    }
  }
  return { ...actual, Raycaster: MockRaycaster };
});

import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { KinematicBodyComponent } from '../../src/components/KinematicBodyComponent.js';
import { VehicleGravitySystem } from '../../src/physics/VehicleGravitySystem.js';

function setup(opts = {}) {
  const world = new World();
  const ground = new THREE.Object3D();
  world.addSystem(new VehicleGravitySystem(ground, opts));
  return { world };
}

describe('VehicleGravitySystem', () => {
  beforeEach(() => {
    mockHits = [];
  });

  it('gruda no chão e zera velocityY quando está caindo (y <= groundY)', () => {
    const { world } = setup();
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 1.0, 0));
    e.addComponent(new KinematicBodyComponent());

    mockHits = [{ point: { y: 1 } }]; // groundY = 1 + wheelRadius(0.3) = 1.3

    world.tick(16);

    const t = e.getComponent(TransformComponent)!;
    const b = e.getComponent(KinematicBodyComponent)!;
    expect(t.y).toBeCloseTo(1.3);
    expect(b.velocityY).toBe(0);
    expect(b.grounded).toBe(true);
  });

  it('não gruda quando está subindo (pulo): segue balístico', () => {
    const { world } = setup();
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 2, 0));
    const body = new KinematicBodyComponent();
    body.velocityY = 10; // subindo
    e.addComponent(body);

    mockHits = [{ point: { y: 1 } }]; // groundY = 1.3, bem abaixo

    world.tick(16);

    const t = e.getComponent(TransformComponent)!;
    expect(t.y).toBeGreaterThan(1.3);
    expect(body.grounded).toBe(false);
    expect(body.velocityY).toBeGreaterThan(0);
  });

  it('chama onFallOff ao cair abaixo do fallThreshold (sem chão)', () => {
    const onFallOff = vi.fn();
    const { world } = setup({ onFallOff });
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, -2000, 0));
    e.addComponent(new KinematicBodyComponent());

    mockHits = []; // sem chão

    world.tick(16);

    expect(onFallOff).toHaveBeenCalledTimes(1);
  });

  it('respeita pauseWhen (não aplica gravidade no editor)', () => {
    const { world } = setup({ pauseWhen: () => true });
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 5, 0));
    const body = new KinematicBodyComponent();
    e.addComponent(body);

    world.tick(16);

    expect(e.getComponent(TransformComponent)!.y).toBe(5);
    expect(body.velocityY).toBe(0);
  });
});
