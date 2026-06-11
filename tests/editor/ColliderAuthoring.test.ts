/**
 * TDD do módulo de autoria de collider (ADR-0060): o CRUD (get/add/update/remove)
 * é puro — opera sobre o `World` + overlay, sem DOM. As interações de heightfield
 * (desenho no viewport) são injetadas e aqui só conferimos a delegação.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three';
import { World } from '../../src/ecs/World.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { createAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import { createColliderApi } from '../../src/editor/authoring/ColliderAuthoring.js';
import type { Game } from '../../src/core/Game.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

function setup() {
  const world = new World();
  const overlay = { version: 1, objects: {}, data: {} } as unknown as SceneFileV1;
  let persists = 0;
  const ctx = createAuthoringContext({ world } as unknown as Game, new Object3D(), overlay, () => {
    persists++;
  });
  let hfStart = 0;
  let hfAuto = 0;
  const api = createColliderApi(ctx, {
    startHeightfield: () => {
      hfStart++;
    },
    autoHeightfield: () => {
      hfAuto++;
    },
  });
  const colliders = (): Record<string, unknown> => (overlay.data['colliders'] as Record<string, unknown>) ?? {};
  return { world, overlay, api, colliders, persists: () => persists, hf: () => ({ hfStart, hfAuto }) };
}

function namedMesh(name: string): Mesh {
  const m = new Mesh(new BoxGeometry(2, 4, 1), new MeshBasicMaterial());
  m.name = name;
  return m;
}

describe('ColliderAuthoring (CRUD)', () => {
  it('get devolve null quando não há collider', () => {
    const { api } = setup();
    expect(api.get(namedMesh('box'))).toBeNull();
  });

  it('add cria entidade Collider2D acoplada + grava overlay + persiste', () => {
    const { api, world, colliders, persists } = setup();
    const m = namedMesh('parede');
    api.add(m);

    // entidade ECS acoplada à mesh
    const ents = world.query(Collider2DComponent);
    expect(ents.length).toBe(1);
    expect(ents[0]!.getComponent(Object3DComponent)!.object).toBe(m);

    // overlay gravado + persistido
    expect(colliders()['parede']).toMatchObject({ shape: 'box', solid: true, oneWay: false });
    expect(persists()).toBe(1);

    // get reflete o estado (deriva do bbox 2×4); não-locked (está no overlay)
    const s = api.get(m)!;
    expect(s.shape).toBe('box');
    expect(s.width).toBeCloseTo(2);
    expect(s.height).toBeCloseTo(4);
    expect(s.solid).toBe(true);
    expect(s.locked).toBe(false);
  });

  it('add exige nome e não duplica', () => {
    const { api, world } = setup();
    api.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())); // sem nome → ignora
    expect(world.query(Collider2DComponent).length).toBe(0);
    const m = namedMesh('x');
    api.add(m);
    api.add(m); // 2ª vez → no-op
    expect(world.query(Collider2DComponent).length).toBe(1);
  });

  it('update muta o componente + overlay', () => {
    const { api, world, colliders } = setup();
    const m = namedMesh('chao');
    api.add(m);
    api.update(m, { solid: false, width: 10, oneWay: true });
    const c = world.query(Collider2DComponent)[0]!.getComponent(Collider2DComponent)!;
    expect(c.solid).toBe(false);
    expect(c.halfWidth).toBe(5);
    expect(c.oneWay).toBe(true);
    expect(colliders()['chao']).toMatchObject({ solid: false, oneWay: true, width: 10 });
  });

  it('remove destrói a entidade + apaga o overlay', () => {
    const { api, world, colliders } = setup();
    const m = namedMesh('y');
    api.add(m);
    api.remove(m);
    expect(world.query(Collider2DComponent).length).toBe(0);
    expect(colliders()['y']).toBeUndefined();
    expect(api.get(m)).toBeNull();
  });

  it('collider definido no código (sem overlay) aparece locked', () => {
    const { api, world } = setup();
    const m = namedMesh('codigo');
    const e = world.createEntity();
    e.addComponent(new Object3DComponent(m));
    e.addComponent(new Collider2DComponent(1, 2, true, false, 0, 0, 'box'));
    // não há entrada em data.colliders → veio do código
    expect(api.get(m)!.locked).toBe(true);
  });

  it('startHeightfield/autoHeightfield delegam aos hooks injetados', () => {
    const { api, hf } = setup();
    const m = namedMesh('hf');
    api.startHeightfield(m);
    api.autoHeightfield(m);
    expect(hf()).toEqual({ hfStart: 1, hfAuto: 1 });
  });
});
