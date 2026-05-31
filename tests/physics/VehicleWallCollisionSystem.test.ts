/**
 * Testes do VehicleWallCollisionSystem (src/physics/VehicleWallCollisionSystem.ts).
 *
 * Mocka `THREE.Raycaster`. Mantém Vector3/Matrix4 reais pra transformDirection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockHit {
  distance: number;
  face: { normal: import('three').Vector3 } | null;
  object: import('three').Object3D;
}

let mockHits: MockHit[] = [];

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockRaycaster {
    far = 0;
    set(): void {}
    intersectObject(): MockHit[] {
      return mockHits;
    }
  }
  return { ...actual, Raycaster: MockRaycaster };
});

import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { KinematicBodyComponent } from '../../src/components/KinematicBodyComponent.js';
import { VehicleWallCollisionSystem } from '../../src/physics/VehicleWallCollisionSystem.js';

function wall(normal: THREE.Vector3, distance: number): MockHit {
  return { distance, face: { normal }, object: new THREE.Object3D() };
}

function setup(opts = {}) {
  const world = new World();
  world.addSystem(new VehicleWallCollisionSystem(new THREE.Object3D(), opts));
  return { world };
}

describe('VehicleWallCollisionSystem', () => {
  beforeEach(() => {
    mockHits = [];
  });

  it('impacto frontal: empurra pra fora ao longo da normal e mantém a velocidade', () => {
    const { world } = setup();
    const e = world.createEntity();
    // rotationY=0 → forward = (0, 0, -1); veículo indo no -Z.
    e.addComponent(new TransformComponent(0, 0, 0, 0));
    const body = new KinematicBodyComponent();
    body.horizontalSpeed = 20;
    e.addComponent(body);

    // Parede de frente (normal aponta +Z, de volta pro veículo), a 1.0 do centro.
    // halfLength=2.2 → pen = 1.2; head-on → empurra +Z por 1.2.
    mockHits = [wall(new THREE.Vector3(0, 0, 1), 1.0)];

    world.tick(16);

    const t = e.getComponent(TransformComponent)!;
    expect(t.z).toBeCloseTo(1.2);
    expect(t.x).toBeCloseTo(0);
    expect(body.horizontalSpeed).toBe(20); // deslize puro: sem perder velocidade
  });

  it('ignora chão (normal quase vertical)', () => {
    const { world } = setup();
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0, 0));
    const body = new KinematicBodyComponent();
    body.horizontalSpeed = 20;
    e.addComponent(body);

    mockHits = [wall(new THREE.Vector3(0, 1, 0), 1.0)]; // normal pra cima = chão

    world.tick(16);

    const t = e.getComponent(TransformComponent)!;
    expect(t.x).toBeCloseTo(0);
    expect(t.z).toBeCloseTo(0);
  });

  it('impacto raspante empurra menos que o frontal (desliza)', () => {
    const { world } = setup();
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0, 0)); // dir = (0,0,-1)
    const body = new KinematicBodyComponent();
    body.horizontalSpeed = 20;
    e.addComponent(body);

    // Normal a 45°: |dir·n| < 1 → pushOut < pen.
    const n = new THREE.Vector3(1, 0, 1).normalize();
    mockHits = [wall(n, 1.0)]; // pen = 1.2

    world.tick(16);

    const t = e.getComponent(TransformComponent)!;
    const pushMag = Math.hypot(t.x, t.z);
    expect(pushMag).toBeGreaterThan(0);
    expect(pushMag).toBeLessThan(1.2); // menos que o head-on
  });

  it('não faz nada com velocidade desprezível', () => {
    const { world } = setup();
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0, 0));
    const body = new KinematicBodyComponent();
    body.horizontalSpeed = 0;
    e.addComponent(body);

    mockHits = [wall(new THREE.Vector3(0, 0, 1), 1.0)];

    world.tick(16);

    const t = e.getComponent(TransformComponent)!;
    expect(t.x).toBe(0);
    expect(t.z).toBe(0);
  });

  it('respeita pauseWhen', () => {
    const { world } = setup({ pauseWhen: () => true });
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0, 0));
    const body = new KinematicBodyComponent();
    body.horizontalSpeed = 20;
    e.addComponent(body);

    mockHits = [wall(new THREE.Vector3(0, 0, 1), 1.0)];

    world.tick(16);

    expect(e.getComponent(TransformComponent)!.z).toBe(0);
  });
});
