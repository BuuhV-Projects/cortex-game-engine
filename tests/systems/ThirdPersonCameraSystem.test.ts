/**
 * Testes do ThirdPersonCameraSystem (src/systems/ThirdPersonCameraSystem.ts).
 * Usa PerspectiveCamera real (three), sem WebGL.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../../src/components/FollowCameraTargetComponent.js';
import { ThirdPersonCameraSystem } from '../../src/systems/ThirdPersonCameraSystem.js';

function setup(camera: THREE.PerspectiveCamera, opts = {}) {
  const world = new World();
  world.addSystem(new ThirdPersonCameraSystem(camera, opts));
  const e = world.createEntity();
  e.addComponent(new TransformComponent(0, 0, 0, 0));
  e.addComponent(new FollowCameraTargetComponent());
  return { world, e };
}

describe('ThirdPersonCameraSystem', () => {
  it('move a câmera em direção ao ponto atrás+acima do alvo (rotationY=0)', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    const { world } = setup(camera, { behind: 5.5, height: 2.2, smoothness: 9 });

    // rotationY=0 → desired = (0, 2.2, 5.5). Com lerp parcial num tick, a câmera
    // deve se mover em direção a esse ponto (z e y crescem).
    world.tick(16);

    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.position.z).toBeLessThanOrEqual(5.5);
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.position.y).toBeLessThanOrEqual(2.2);
  });

  it('converge pro alvo após vários ticks', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    const { world } = setup(camera, { behind: 5.5, height: 2.2, smoothness: 9 });

    for (let i = 0; i < 200; i++) world.tick(16);

    expect(camera.position.z).toBeCloseTo(5.5, 1);
    expect(camera.position.y).toBeCloseTo(2.2, 1);
  });

  it('respeita pauseWhen (não move a câmera)', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    const { world } = setup(camera, { pauseWhen: () => true });

    world.tick(16);

    expect(camera.position.x).toBe(0);
    expect(camera.position.y).toBe(0);
    expect(camera.position.z).toBe(0);
  });
});
