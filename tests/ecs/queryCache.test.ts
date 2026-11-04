/**
 * Query cacheada do `World.tick` (SPEC-0673): reusa o array de cada sistema
 * enquanto a estrutura do ECS não muda, e refaz quando uma entidade ganha/perde
 * componente ou entra/sai do mundo.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { System } from '../../src/ecs/System.js';
import { Component } from '../../src/ecs/Component.js';
import type { Entity } from '../../src/ecs/Entity.js';

class A extends Component {}
class B extends Component {}

/** Guarda o array que recebeu em cada quadro. */
class Gravador extends System {
  static override requiredComponents = [A, B];
  vistos: Entity[][] = [];
  update(entities: Entity[]): void {
    this.vistos.push(entities);
  }
}
class Todos extends System {
  vistos: Entity[][] = [];
  update(entities: Entity[]): void {
    this.vistos.push(entities);
  }
}

function montar() {
  const world = new World();
  const sys = new Gravador();
  world.addSystem(sys);
  const ab = world.createEntity().addComponent(new A()).addComponent(new B());
  world.createEntity().addComponent(new A());
  return { world, sys, ab, ultimo: () => sys.vistos[sys.vistos.length - 1]! };
}

describe('World: query cacheada no tick', () => {
  it('sem mudança estrutural, reusa o MESMO array entre quadros', () => {
    const { world, sys } = montar();
    world.tick(16);
    world.tick(16);
    expect(sys.vistos[0]).toBe(sys.vistos[1]);
    expect(sys.vistos[0]).toHaveLength(1);
  });

  it('addComponent que completa a assinatura entra na query seguinte', () => {
    const { world, ultimo } = montar();
    world.tick(16);
    const so = world.createEntity().addComponent(new A());
    world.tick(16);
    expect(ultimo()).not.toContain(so);
    so.addComponent(new B());
    world.tick(16);
    expect(ultimo()).toContain(so);
    expect(ultimo()).toHaveLength(2);
  });

  it('removeComponent tira a entidade; remover o que não existe não invalida', () => {
    const { world, ab, ultimo } = montar();
    world.tick(16);
    const antes = ultimo();
    ab.removeComponent(class Ausente extends Component {});
    world.tick(16);
    expect(ultimo()).toBe(antes);
    ab.removeComponent(B);
    world.tick(16);
    expect(ultimo()).toEqual([]);
  });

  it('destroyEntity e createEntity invalidam (inclusive a query sem componentes)', () => {
    const { world, ab, ultimo } = montar();
    const todos = new Todos();
    world.addSystem(todos);
    world.tick(16);
    expect(todos.vistos[0]).toHaveLength(2);
    world.destroyEntity(ab);
    world.tick(16);
    expect(ultimo()).toEqual([]);
    expect(todos.vistos[1]).toHaveLength(1);
    world.createEntity();
    world.tick(16);
    expect(todos.vistos[2]).toHaveLength(2);
  });

  it('a invalidação cria array novo: o do quadro anterior não muda por baixo', () => {
    const { world, ultimo } = montar();
    world.tick(16);
    const antigo = ultimo();
    world.createEntity().addComponent(new A()).addComponent(new B());
    world.tick(16);
    expect(antigo).toHaveLength(1);
    expect(ultimo()).toHaveLength(2);
  });

  it('clear() esvazia o cache: a cena seguinte não vê entidades antigas', () => {
    const { world } = montar();
    world.tick(16);
    world.clear();
    const sys = new Gravador();
    world.addSystem(sys);
    world.tick(16);
    expect(sys.vistos[0]).toEqual([]);
  });

  it('query() pública continua devolvendo array novo a cada chamada', () => {
    const { world } = montar();
    const q1 = world.query(A, B);
    const q2 = world.query(A, B);
    expect(q1).not.toBe(q2);
    expect(q1).toEqual(q2);
  });
});
