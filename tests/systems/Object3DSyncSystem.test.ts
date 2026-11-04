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

  // ─── SPEC-0673: só escreve o que mudou ─────────────────────────────────────

  /** Entidade sincronizada + espiões nos setters que recalculam o quaternion. */
  function montar(t = new TransformComponent(1, 2, 3, 0.5)) {
    const world = new World();
    world.addSystem(new Object3DSyncSystem());
    const obj = new THREE.Object3D();
    const entity = world.createEntity().addComponent(t).addComponent(new Object3DComponent(obj));
    world.tick(16);
    let escritas = 0;
    const set = obj.position.set.bind(obj.position);
    obj.position.set = (x: number, y: number, z: number) => {
      escritas++;
      return set(x, y, z);
    };
    const onChange = (obj.rotation as unknown as { _onChangeCallback: () => void })._onChangeCallback;
    obj.rotation._onChange(() => {
      escritas++;
      onChange();
    });
    return { world, obj, entity, t, escritas: () => escritas };
  }

  it('entidade parada (ex.: colisor estático) não recebe escrita nem recálculo de quaternion', () => {
    const { world, escritas } = montar();
    for (let i = 0; i < 5; i++) world.tick(16);
    expect(escritas()).toBe(0);
  });

  it('transform escrito direto (player.transform.x = …) é sincronizado no quadro seguinte', () => {
    const { world, obj, t } = montar();
    t.x = 7;
    t.rotationY = -1.25;
    world.tick(16);
    expect(obj.position.toArray()).toEqual([7, 2, 3]);
    expect(obj.rotation.y).toBe(-1.25);
  });

  it('Object3D mexido por fora volta a seguir o transform, como antes', () => {
    const { world, obj } = montar();
    obj.position.x = 99;
    obj.rotation.order = 'XYZ';
    obj.rotation.y = 3;
    world.tick(16);
    expect(obj.position.x).toBe(1);
    expect(obj.rotation.order).toBe('YXZ');
    expect(obj.rotation.y).toBe(0.5);
  });

  it('o quaternion fica coerente com o yaw sincronizado', () => {
    const { world, obj, t } = montar();
    t.rotationY = 0.9;
    world.tick(16);
    const esperado = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.9, 0, 'YXZ'));
    expect(obj.quaternion.angleTo(esperado)).toBeCloseTo(0, 6);
  });

  it('trocar o TransformComponent da entidade passa a sincronizar o novo', () => {
    const { world, obj, entity } = montar();
    entity.addComponent(new TransformComponent(-4, 0, 8, 0));
    world.tick(16);
    expect(obj.position.toArray()).toEqual([-4, 0, 8]);
  });

  it('trocar o object do Object3DComponent passa a sincronizar o novo objeto', () => {
    const { world, entity } = montar();
    const novo = new THREE.Object3D();
    entity.getComponent(Object3DComponent)!.object = novo;
    world.tick(16);
    expect(novo.position.toArray()).toEqual([1, 2, 3]);
  });

  it('entidade criada ou destruída depois entra/sai da sincronização', () => {
    const { world } = montar();
    const obj = new THREE.Object3D();
    const e = world.createEntity().addComponent(new TransformComponent(5)).addComponent(new Object3DComponent(obj));
    world.tick(16);
    expect(obj.position.x).toBe(5);
    world.destroyEntity(e);
    e.getComponent(TransformComponent)!.x = 6;
    world.tick(16);
    expect(obj.position.x).toBe(5);
  });
});
