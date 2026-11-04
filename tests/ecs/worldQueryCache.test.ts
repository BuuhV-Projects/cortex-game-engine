/**
 * ADR-0676: a consulta do `World.tick` fica em cache enquanto a estrutura do ECS (entidades e componentes) não muda,
 * e remonta num array NOVO quando muda.
 */
import { describe, expect, it } from 'vitest';
import { Component } from '../../src/ecs/Component.js';
import type { Entity } from '../../src/ecs/Entity.js';
import { System } from '../../src/ecs/System.js';
import { World } from '../../src/ecs/World.js';

class A extends Component {}
class B extends Component {}

/** Guarda o array recebido em cada `update`. */
class Recorder extends System {
  readonly seen: Entity[][] = [];
  override update(entities: Entity[]): void {
    this.seen.push(entities);
  }
}
class NeedsAB extends Recorder {
  static override requiredComponents = [A, B];
}
class NeedsAll extends Recorder {
  static override requiredComponents = [];
}

function setup(): { world: World; ab: NeedsAB; all: NeedsAll; e1: Entity; e2: Entity } {
  const world = new World();
  const ab = new NeedsAB();
  const all = new NeedsAll();
  world.addSystem(ab);
  world.addSystem(all);
  const e1 = world.createEntity().addComponent(new A()).addComponent(new B());
  const e2 = world.createEntity().addComponent(new A());
  return { world, ab, all, e1, e2 };
}

describe('World.tick — consulta em cache (ADR-0676)', () => {
  it('sem mudança de estrutura, o mesmo array volta todo quadro', () => {
    const { world, ab, all, e1, e2 } = setup();
    world.tick(16);
    world.tick(16);
    expect(ab.seen[0]).toEqual([e1]);
    expect(ab.seen[1]).toBe(ab.seen[0]);
    expect(all.seen[0]).toEqual([e1, e2]);
    expect(all.seen[1]).toBe(all.seen[0]);
  });

  it('componente adicionado remonta num array novo, sem mexer no antigo', () => {
    const { world, ab, e1, e2 } = setup();
    world.tick(16);
    e2.addComponent(new B());
    world.tick(16);
    expect(ab.seen[0]).toEqual([e1]);
    expect(ab.seen[1]).toEqual([e1, e2]);
    expect(ab.seen[1]).not.toBe(ab.seen[0]);
  });

  it('componente removido e entidade destruída saem na consulta seguinte', () => {
    const { world, ab, all, e1, e2 } = setup();
    world.tick(16);
    e1.removeComponent(B);
    world.destroyEntity(e2);
    world.tick(16);
    expect(ab.seen[1]).toEqual([]);
    expect(all.seen[1]).toEqual([e1]);
  });

  it('remover um componente ausente não invalida a consulta (SPEC-0673)', () => {
    const { world, ab, e1 } = setup();
    world.tick(16);
    e1.removeComponent(class Absent extends Component {});
    world.tick(16);
    expect(ab.seen[1]).toBe(ab.seen[0]);
  });

  it('a invalidação não mexe no array do quadro anterior (SPEC-0673)', () => {
    const { world, all } = setup();
    world.tick(16);
    const old = all.seen[0]!;
    world.createEntity();
    world.tick(16);
    expect(old).toHaveLength(2);
    expect(all.seen[1]).toHaveLength(3);
  });

  it('entidade criada entra na ordem de inserção', () => {
    const { world, all, e1, e2 } = setup();
    world.tick(16);
    const e3 = world.createEntity();
    world.tick(16);
    expect(all.seen[1]).toEqual([e1, e2, e3]);
  });

  it('mudança feita por um sistema no meio do tick chega aos sistemas seguintes', () => {
    const world = new World();
    const e = world.createEntity().addComponent(new A());
    class Adds extends System {
      static override requiredComponents = [];
      override priority = 0;
      override update(): void {
        if (!e.hasComponent(B)) e.addComponent(new B());
      }
    }
    const ab = new NeedsAB();
    ab.priority = 1;
    world.addSystem(new Adds());
    world.addSystem(ab);
    world.tick(16);
    expect(ab.seen[0]).toEqual([e]);
  });

  it('clear mantém só as preservadas', () => {
    const { world, all, e1 } = setup();
    all.keepOnClear = true;
    e1.keepOnClear = true;
    world.tick(16);
    world.clear();
    world.tick(16);
    expect(all.seen[1]).toEqual([e1]);
  });

  it('query público devolve um array novo por chamada', () => {
    const { world, e1 } = setup();
    const first = world.query(A, B);
    const second = world.query(A, B);
    expect(first).toEqual([e1]);
    expect(second).not.toBe(first);
  });

  it('requiredComponents como getter (array novo por leitura) continua filtrando certo', () => {
    class NeedsAGetter extends Recorder {
      static override get requiredComponents(): (typeof A)[] {
        return [A];
      }
    }
    const { world, e1, e2 } = setup();
    const getter = new NeedsAGetter();
    world.addSystem(getter);
    world.tick(16);
    world.tick(16);
    expect(getter.seen[0]).toEqual([e1, e2]);
    expect(getter.seen[1]).toEqual([e1, e2]);
  });
});
