/**
 * Testes do Object3DSyncSystem (src/systems/Object3DSyncSystem.ts).
 *
 * Lógica pura sobre Object3D real — sem WebGL, roda em Node.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { Object3DSyncSystem } from '../../src/systems/Object3DSyncSystem.js';

describe('Object3DSyncSystem', () => {
  it('copia x/y/z e rotationY do TransformComponent para o Object3D', () => {
    const world = new World();
    world.addSystem(new Object3DSyncSystem());

    const obj = new THREE.Object3D();
    const entity = world.createEntity();
    entity.addComponent(new TransformComponent(1, 2, 3, 0.5));
    entity.addComponent(new Object3DComponent(obj));

    world.tick(16);

    expect(obj.position.x).toBe(1);
    expect(obj.position.y).toBe(2);
    expect(obj.position.z).toBe(3);
    expect(obj.rotation.y).toBeCloseTo(0.5);
  });

  it("força rotation.order = 'YXZ' (suspensão local depende disso)", () => {
    const world = new World();
    world.addSystem(new Object3DSyncSystem());

    const obj = new THREE.Object3D();
    obj.rotation.order = 'XYZ';
    const entity = world.createEntity();
    entity.addComponent(new TransformComponent());
    entity.addComponent(new Object3DComponent(obj));

    world.tick(16);

    expect(obj.rotation.order).toBe('YXZ');
  });

  it('não toca rotation.x/z (pitch/roll aplicados por outro sistema)', () => {
    const world = new World();
    world.addSystem(new Object3DSyncSystem());

    const obj = new THREE.Object3D();
    obj.rotation.order = 'YXZ';
    obj.rotation.x = 0.3;
    obj.rotation.z = -0.2;
    const entity = world.createEntity();
    entity.addComponent(new TransformComponent(0, 0, 0, 1));
    entity.addComponent(new Object3DComponent(obj));

    world.tick(16);

    expect(obj.rotation.x).toBeCloseTo(0.3);
    expect(obj.rotation.z).toBeCloseTo(-0.2);
    expect(obj.rotation.y).toBeCloseTo(1);
  });
});
