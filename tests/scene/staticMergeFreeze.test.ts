/**
 * Merge estático congela no Object3DSyncSystem as entidades tratadas como cenário
 * (SPEC-0684) e deixa no laço as dinâmicas, os gatilhos, as marcadas pelo jogo e as
 * animadas. Equivalência: depois do merge, a cena termina igual à do caminho antigo.
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial, type Material } from 'three';
import { mergeStaticScene } from '../../src/scene/StaticMerge.js';
import { World } from '../../src/ecs/World.js';
import type { Entity } from '../../src/ecs/Entity.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { Object3DSyncSystem } from '../../src/systems/Object3DSyncSystem.js';

/** Passo de simulação dos testes (ms). */
const DT = 16;
/** Quadros rodados depois do merge. */
const FRAMES = 3;

/** Entidade de colisor estático (como o SceneBuilder cria) com uma caixa. */
function collider(world: World, root: Object3D, mat: Material, x: number, solid = true): { entity: Entity; mesh: Mesh } {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), mat);
  mesh.position.set(x, 0, 0);
  root.add(mesh);
  const c = new Collider2DComponent();
  c.solid = solid;
  const entity = world
    .createEntity()
    .addComponent(new TransformComponent(x, 0, 0, 0))
    .addComponent(new Object3DComponent(mesh))
    .addComponent(c);
  return { entity, mesh };
}

describe('mergeStaticScene — congelamento do sync (SPEC-0684)', () => {
  it('congela a estática fundida e a mantida; não congela dinâmica, gatilho nem cortexDynamic', () => {
    const world = new World();
    const root = new Object3D();
    const shared = new MeshBasicMaterial({ color: 0x808080 });
    const a = collider(world, root, shared, 0);
    const b = collider(world, root, shared, 2);
    const kept = collider(world, root, new MeshBasicMaterial({ color: 0xff0000 }), 4); // grupo de 1
    const trigger = collider(world, root, shared, 6, false);
    const marked = collider(world, root, shared, 8);
    marked.mesh.userData['cortexDynamic'] = true;
    const player = collider(world, root, shared, 10);
    player.entity.addComponent(new CharacterBodyComponent());

    const stats = mergeStaticScene(root, world);

    expect(stats.merged).toBe(2);
    expect(stats.frozen).toBe(3);
    for (const e of [a, b, kept]) expect(Object3DSyncSystem.isFrozen(e.entity)).toBe(true);
    for (const e of [trigger, marked, player]) expect(Object3DSyncSystem.isFrozen(e.entity)).toBe(false);
  });

  it('não congela entidade sob raiz animada (extraDynamicRoots)', () => {
    const world = new World();
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const animated = collider(world, root, mat, 0);
    collider(world, root, mat, 2);
    const stats = mergeStaticScene(root, world, [animated.mesh]);
    expect(stats.frozen).toBe(1);
    expect(Object3DSyncSystem.isFrozen(animated.entity)).toBe(false);
  });

  it('sem world nada congela', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    root.add(new Mesh(new BoxGeometry(), mat), new Mesh(new BoxGeometry(), mat));
    expect(mergeStaticScene(root).frozen).toBe(0);
  });

  it('o sync só visita as não congeladas depois do merge', () => {
    const world = new World();
    const sync = new Object3DSyncSystem();
    world.addSystem(sync);
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const STATIC_COUNT = 20;
    for (let i = 0; i < STATIC_COUNT; i++) collider(world, root, mat, i * 2);
    collider(world, root, mat, -2).entity.addComponent(new CharacterBodyComponent());
    world.tick(DT);
    expect(sync.syncedCount).toBe(STATIC_COUNT + 1);
    mergeStaticScene(root, world);
    world.tick(DT);
    expect(sync.syncedCount).toBe(1);
  });

  it('equivalência: a cena depois do merge e dos quadros é a mesma do caminho sem congelar', () => {
    const run = (freeze: boolean): number[][] => {
      const world = new World();
      world.addSystem(new Object3DSyncSystem());
      const root = new Object3D();
      const shared = new MeshBasicMaterial();
      const all = [
        collider(world, root, shared, 0),
        collider(world, root, shared, 3),
        collider(world, root, new MeshBasicMaterial({ color: 0x00ff00 }), 5), // mantida pelo merge
      ];
      // Transform diferente do objeto: o primeiro sync é que acerta a malha mantida.
      for (const { entity, mesh } of all) {
        entity.getComponent(TransformComponent)!.rotationY = 0.4;
        mesh.rotation.order = 'XYZ';
      }
      mergeStaticScene(root, world);
      if (!freeze) for (const { entity } of all) Object3DSyncSystem.unfreeze(entity);
      for (let i = 0; i < FRAMES; i++) world.tick(DT);
      root.updateMatrixWorld(true);
      const out: number[][] = [];
      root.traverse((o) => out.push([...o.matrixWorld.elements, o.rotation.order === 'YXZ' ? 1 : 0]));
      // As fundidas saíram da cena; compara a pose local delas (o sync antigo seguia escrevendo nelas).
      for (const { mesh } of all) out.push([...mesh.position.toArray(), ...mesh.quaternion.toArray(), mesh.rotation.order === 'YXZ' ? 1 : 0]);
      return out;
    };
    expect(run(true)).toEqual(run(false));
  });
});
