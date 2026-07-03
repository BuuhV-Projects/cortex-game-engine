/**
 * Cobre o lookup de entidade pelo nome do objeto de cena
 * ({@link entityByObjectName}) — o caminho recomendado quando um query por
 * componentes é ambíguo (vários characters) e o script quer UM objeto.
 */

import { describe, it, expect } from 'vitest';
import { Group, Mesh, BoxGeometry } from 'three';
import { World } from '../src/ecs/World.js';
import { Object3DComponent, entityByObjectName } from '../src/components/Object3DComponent.js';

const withObject = (world: World, name: string) => {
  const e = world.createEntity();
  const obj = new Group();
  obj.name = name;
  e.addComponent(new Object3DComponent(obj));
  return e;
};

describe('entityByObjectName', () => {
  it('acha a entidade certa entre várias', () => {
    const world = new World();
    withObject(world, 'npc-1');
    const boss = withObject(world, 'boss-1');
    withObject(world, 'npc-2');
    expect(entityByObjectName(world, 'boss-1')).toBe(boss);
  });

  it('acha pelo nome de um FILHO do objeto (glb com hierarquia)', () => {
    const world = new World();
    const e = withObject(world, 'raiz');
    const child = new Mesh(new BoxGeometry(1, 1, 1));
    child.name = 'cabeca';
    e.getComponent(Object3DComponent)!.object.add(child);
    expect(entityByObjectName(world, 'cabeca')).toBe(e);
  });

  it('null quando não existe', () => {
    const world = new World();
    withObject(world, 'npc-1');
    expect(entityByObjectName(world, 'nao-existe')).toBeNull();
  });

  it('entidade sem Object3DComponent não interfere', () => {
    const world = new World();
    world.createEntity();
    const alvo = withObject(world, 'alvo');
    expect(entityByObjectName(world, 'alvo')).toBe(alvo);
  });
});
