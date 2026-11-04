/**
 * Congelamento do Object3DSyncSystem (SPEC-0684): a congelada sai do laço com a pose
 * do primeiro sync; `unfreeze` devolve; componente dinâmico novo descongela.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { structureVersion } from '../../src/ecs/structureVersion.js';
import { Component } from '../../src/ecs/Component.js';
import type { Entity } from '../../src/ecs/Entity.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { Object3DSyncSystem } from '../../src/systems/Object3DSyncSystem.js';

/** Passo de simulação dos testes (ms). */
const DT = 16;

/** Componente de jogo qualquer (fora do conjunto estático). */
class GameplayComponent extends Component {}

function setup() {
  const world = new World();
  const sync = new Object3DSyncSystem();
  world.addSystem(sync);
  const add = (t: TransformComponent, ...extra: Component[]): { entity: Entity; obj: THREE.Object3D } => {
    const obj = new THREE.Object3D();
    const entity = world.createEntity().addComponent(t).addComponent(new Object3DComponent(obj));
    for (const c of extra) entity.addComponent(c);
    return { entity, obj };
  };
  return { world, sync, add };
}

describe('Object3DSyncSystem — congelamento (SPEC-0684)', () => {
  it('freeze faz a escrita do primeiro sync (pose e ordem YXZ) sem precisar de tick', () => {
    const { add } = setup();
    const { entity, obj } = add(new TransformComponent(4, 5, 6, 0.7));
    obj.rotation.order = 'XYZ';
    expect(Object3DSyncSystem.freeze(entity)).toBe(true);
    expect(obj.position.toArray()).toEqual([4, 5, 6]);
    expect(obj.rotation.order).toBe('YXZ');
    expect(obj.rotation.y).toBeCloseTo(0.7);
    expect(Object3DSyncSystem.isFrozen(entity)).toBe(true);
  });

  it('congelada fica fora do laço: mudar o transform não chega ao objeto; a dinâmica segue', () => {
    const { world, add } = setup();
    const frozen = add(new TransformComponent(1, 0, 0), new Collider2DComponent());
    const moving = add(new TransformComponent(0, 0, 0));
    world.tick(DT);
    Object3DSyncSystem.freeze(frozen.entity);
    frozen.entity.getComponent(TransformComponent)!.x = 99;
    moving.entity.getComponent(TransformComponent)!.x = 7;
    world.tick(DT);
    expect(frozen.obj.position.x).toBe(1);
    expect(moving.obj.position.x).toBe(7);
  });

  it('o laço visita só as não congeladas (contagem de pares)', () => {
    const { world, sync, add } = setup();
    const STATIC_COUNT = 50;
    const entities: Entity[] = [];
    for (let i = 0; i < STATIC_COUNT; i++) entities.push(add(new TransformComponent(i, 0, 0), new Collider2DComponent()).entity);
    add(new TransformComponent());
    world.tick(DT);
    expect(sync.syncedCount).toBe(STATIC_COUNT + 1);
    for (const e of entities) Object3DSyncSystem.freeze(e);
    world.tick(DT);
    expect(sync.syncedCount).toBe(1);
  });

  it('unfreeze devolve ao laço e o transform volta a ser copiado', () => {
    const { world, sync, add } = setup();
    const { entity, obj } = add(new TransformComponent(1, 2, 3));
    Object3DSyncSystem.freeze(entity);
    world.tick(DT);
    expect(sync.syncedCount).toBe(0);
    Object3DSyncSystem.unfreeze(entity);
    entity.getComponent(TransformComponent)!.z = -5;
    world.tick(DT);
    expect(sync.syncedCount).toBe(1);
    expect(obj.position.z).toBe(-5);
    expect(Object3DSyncSystem.isFrozen(entity)).toBe(false);
  });

  it('ganhar componente fora do conjunto estático descongela na troca de estrutura', () => {
    const { world, add } = setup();
    const { entity, obj } = add(new TransformComponent(), new Collider2DComponent());
    Object3DSyncSystem.freeze(entity);
    world.tick(DT);
    entity.addComponent(new GameplayComponent());
    entity.getComponent(TransformComponent)!.y = 3;
    world.tick(DT);
    expect(Object3DSyncSystem.isFrozen(entity)).toBe(false);
    expect(obj.position.y).toBe(3);
  });

  it('virar gatilho por troca do collider descongela; trocar por outro sólido não', () => {
    const { world, add } = setup();
    const solid = add(new TransformComponent(), new Collider2DComponent());
    const trigger = add(new TransformComponent(), new Collider2DComponent());
    Object3DSyncSystem.freeze(solid.entity);
    Object3DSyncSystem.freeze(trigger.entity);
    world.tick(DT);
    solid.entity.addComponent(new Collider2DComponent());
    const triggerCollider = new Collider2DComponent();
    triggerCollider.solid = false;
    trigger.entity.addComponent(triggerCollider);
    world.tick(DT);
    expect(Object3DSyncSystem.isFrozen(solid.entity)).toBe(true);
    expect(Object3DSyncSystem.isFrozen(trigger.entity)).toBe(false);
  });

  it('trocar o Object3DComponent por um novo descongela (o novo nasce fora do congelamento)', () => {
    const { world, add } = setup();
    const { entity } = add(new TransformComponent(2, 0, 0));
    Object3DSyncSystem.freeze(entity);
    world.tick(DT);
    const other = new THREE.Object3D();
    entity.addComponent(new Object3DComponent(other));
    world.tick(DT);
    expect(other.position.x).toBe(2);
  });

  it('freeze devolve false sem Object3DComponent; unfreeze de não congelada não refaz a estrutura', () => {
    const { world } = setup();
    const bare = world.createEntity().addComponent(new TransformComponent());
    expect(Object3DSyncSystem.freeze(bare)).toBe(false);
    const version = structureVersion();
    Object3DSyncSystem.unfreeze(bare);
    expect(structureVersion()).toBe(version);
  });

  it('equivalência: com congelamento, as poses finais são as do sync antigo para quem não se move', () => {
    const POSES: Array<[number, number, number, number]> = [
      [1, 2, 3, 0.1],
      [-4, 0, 9, 2.5],
      [0, 0, 0, 0],
    ];
    const run = (freeze: boolean): number[][] => {
      const { world, add } = setup();
      const objs = POSES.map(([x, y, z, r]) => {
        const created = add(new TransformComponent(x, y, z, r), new Collider2DComponent());
        created.obj.rotation.order = 'XZY';
        if (freeze) Object3DSyncSystem.freeze(created.entity);
        return created.obj;
      });
      world.tick(DT);
      world.tick(DT);
      return objs.map((o) => [...o.position.toArray(), o.rotation.y, o.rotation.order === 'YXZ' ? 1 : 0, ...o.quaternion.toArray()]);
    };
    expect(run(true)).toEqual(run(false));
  });
});
