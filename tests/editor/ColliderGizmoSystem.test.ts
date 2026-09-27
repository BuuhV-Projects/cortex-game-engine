import { describe, it, expect, vi } from 'vitest';
import { Group, Mesh, Scene } from 'three';
import { World } from '../../src/ecs/World.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { ColliderGizmoSystem } from '../../src/editor/ColliderGizmoSystem.js';
import { createEditorSelection } from '../../src/editor/EditorSelection.js';
import type { EditorState } from '../../src/editor/EditorState.js';

describe('ColliderGizmoSystem', () => {
  it('desenha só a seleção, libera recursos e preserva o perfil em edição', () => {
    const world = new World();
    const scene = new Scene();
    const state = { active: true } as EditorState;
    const selection = createEditorSelection();
    const entities = Array.from({ length: 651 }, () => {
      const e = world.createEntity();
      e.addComponent(new Object3DComponent(new Group()));
      e.addComponent(new TransformComponent(3, 4, 5));
      e.addComponent(new Collider2DComponent(2, 1, true, false, 1, 2));
      return e;
    });
    let editing: (typeof entities)[number] | null = null;
    world.addSystem(new ColliderGizmoSystem(state, scene, selection, () => editing));
    const group = scene.getObjectByName('__editor_collider_gizmos')!;
    const object = (i: number) => entities[i]!.getComponent(Object3DComponent)!.object;

    world.tick(16);
    expect(group.children).toHaveLength(0);
    selection.setCurrent(object(0));
    world.tick(16);
    expect(group.children).toHaveLength(1);
    const mesh = group.children[0] as Mesh;
    expect(mesh.position.toArray()).toEqual([4, 6, 5]);
    const geometryDisposed = vi.spyOn(mesh.geometry, 'dispose');
    const materialDisposed = vi.spyOn(mesh.material as import('three').Material, 'dispose');

    selection.setCurrent(object(1));
    world.tick(16);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).not.toBe(mesh);
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    selection.setCurrent(object(0), [object(0), object(1)]);
    world.tick(16);
    expect(group.children).toHaveLength(2);
    world.destroyEntity(entities[0]!);
    world.tick(16);
    expect(group.children).toHaveLength(1);
    selection.setCurrent(null);
    world.tick(16);
    expect(group.children).toHaveLength(0);

    editing = entities[2]!;
    const collider = editing.getComponent(Collider2DComponent)!;
    collider.shape = 'heightfield';
    collider.points = [[-1, 0], [1, 1]];
    world.tick(16);
    expect(group.children).toHaveLength(1);
    editing = null;
    world.tick(16);
    expect(group.children).toHaveLength(0);

    selection.setCurrent(object(1));
    world.tick(16);
    state.active = false;
    world.tick(16);
    expect(group.visible).toBe(false);
    state.active = true;
    selection.setCurrent(null);
    world.tick(16);
    expect(group.visible).toBe(true);
    expect(group.children).toHaveLength(0);
  });
});
