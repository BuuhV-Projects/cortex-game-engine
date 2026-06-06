/**
 * Testes da câmera 2D-follow (src/systems/FollowCamera2DSystem.ts).
 * Cobre: seguir o alvo no plano XY, limites de enquadramento e roll no Z.
 * Usa uma PerspectiveCamera real (math do three roda em node, sem WebGPU).
 */
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../../src/components/FollowCameraTargetComponent.js';
import { FollowCamera2DSystem, type FollowCamera2DOptions } from '../../src/systems/FollowCamera2DSystem.js';

function setup(opts: FollowCamera2DOptions, x: number, y: number) {
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  const world = new World();
  const sys = new FollowCamera2DSystem(camera, opts);
  world.addSystem(sys);
  const target = world.createEntity();
  target.addComponent(new TransformComponent(x, y, 0));
  target.addComponent(new FollowCameraTargetComponent());
  return { camera, world, sys };
}

describe('FollowCamera2DSystem', () => {
  it('segue o alvo no plano XY (com offset e distância no Z)', () => {
    const { camera, world } = setup({ offset: [0, 1], distance: 18, responsiveness: 0 }, 10, 5);
    world.tick(16);
    expect(camera.position.x).toBeCloseTo(10);
    expect(camera.position.y).toBeCloseTo(6); // 5 + offset.y(1)
    expect(camera.position.z).toBeCloseTo(18);
  });

  it('respeita os limites de enquadramento (bounds)', () => {
    const { camera, world } = setup({ offset: [0, 0], responsiveness: 0, bounds: { maxX: 2, minY: 3 } }, 10, 0);
    world.tick(16);
    expect(camera.position.x).toBeCloseTo(2); // clampado em maxX
    expect(camera.position.y).toBeCloseTo(3); // clampado em minY
  });

  it('aplica roll no eixo Z via vetor up', () => {
    const { camera, world, sys } = setup({ responsiveness: 0 }, 0, 0);
    sys.setRoll(0.1);
    world.tick(16);
    expect(camera.up.x).toBeCloseTo(Math.sin(0.1));
    expect(camera.up.y).toBeCloseTo(Math.cos(0.1));
  });
});
