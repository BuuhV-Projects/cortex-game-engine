/**
 * Testes unitários para World (src/ecs/World.ts)
 * Cobre: createEntity, destroyEntity, query por componente, tick com system mock.
 * Referência: ADR-0002.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { World } from '../src/ecs/World.js';
import { Entity } from '../src/ecs/Entity.js';
import { Component } from '../src/ecs/Component.js';
import { System } from '../src/ecs/System.js';

// ─── Componentes de teste ──────────────────────────────────────────────────

class PositionComponent extends Component {
  x = 0;
}

class VelocityComponent extends Component {
  vx = 0;
}

// ─── Systems de teste ──────────────────────────────────────────────────────

/** System que requer Position + Velocity — usado para testar filtragem. */
class MovementSystem extends System {
  static override requiredComponents = [PositionComponent, VelocityComponent];
  readonly spy = vi.fn();
  update(entities: Entity[], deltaTime: number): void {
    this.spy(entities, deltaTime);
  }
}

/** System sem requisitos — recebe todas as entities. */
class AnySystem extends System {
  readonly spy = vi.fn();
  update(entities: Entity[], deltaTime: number): void {
    this.spy(entities, deltaTime);
  }
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('World', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  // ── createEntity ─────────────────────────────────────────────────────────

  describe('createEntity', () => {
    it('cria e retorna uma instância de Entity', () => {
      const entity = world.createEntity();
      expect(entity).toBeInstanceOf(Entity);
    });

    it('atribui id único a cada entity criada', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      expect(e1.id).not.toBe(e2.id);
    });

    it('registra a entity no world (aparece em query sem filtro)', () => {
      const entity = world.createEntity();
      expect(world.query()).toContain(entity);
    });

    it('registra múltiplas entities de forma independente', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const all = world.query();
      expect(all).toContain(e1);
      expect(all).toContain(e2);
      expect(all).toHaveLength(2);
    });
  });

  // ── destroyEntity ─────────────────────────────────────────────────────────

  describe('destroyEntity', () => {
    it('remove a entity do world', () => {
      const entity = world.createEntity();
      world.destroyEntity(entity);
      expect(world.query()).not.toContain(entity);
    });

    it('não lança erro ao destruir entity alheia ao world', () => {
      const external = new Entity(); // criada fora do world
      expect(() => world.destroyEntity(external)).not.toThrow();
    });

    it('remove apenas a entity especificada, preservando as demais', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      world.destroyEntity(e1);
      expect(world.query()).not.toContain(e1);
      expect(world.query()).toContain(e2);
    });
  });

  // ── query por componente ──────────────────────────────────────────────────

  describe('query por componente', () => {
    it('sem argumentos retorna todas as entities do world', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const all = world.query();
      expect(all).toContain(e1);
      expect(all).toContain(e2);
    });

    it('filtra entities que possuem o componente especificado', () => {
      const eWithPos = world.createEntity();
      eWithPos.addComponent(new PositionComponent());
      const eWithout = world.createEntity();

      const result = world.query(PositionComponent);
      expect(result).toContain(eWithPos);
      expect(result).not.toContain(eWithout);
    });

    it('filtra por múltiplos componentes com AND semântico', () => {
      const eBoth = world.createEntity();
      eBoth.addComponent(new PositionComponent());
      eBoth.addComponent(new VelocityComponent());

      const eOnlyPos = world.createEntity();
      eOnlyPos.addComponent(new PositionComponent());

      const result = world.query(PositionComponent, VelocityComponent);
      expect(result).toContain(eBoth);
      expect(result).not.toContain(eOnlyPos);
    });

    it('retorna array vazio quando nenhuma entity satisfaz o filtro', () => {
      world.createEntity(); // sem componentes
      expect(world.query(PositionComponent)).toHaveLength(0);
    });

    it('não inclui entities destruídas', () => {
      const entity = world.createEntity();
      entity.addComponent(new PositionComponent());
      world.destroyEntity(entity);
      expect(world.query(PositionComponent)).not.toContain(entity);
    });
  });

  // ── tick com system mock ──────────────────────────────────────────────────

  describe('tick com system mock', () => {
    it('chama update do system com as entities filtradas e o deltaTime correto', () => {
      const system = new MovementSystem();
      world.addSystem(system);

      const eMatch = world.createEntity();
      eMatch.addComponent(new PositionComponent());
      eMatch.addComponent(new VelocityComponent());

      const eNoMatch = world.createEntity(); // não possui os requisitos

      world.tick(16);

      expect(system.spy).toHaveBeenCalledTimes(1);
      const [entities, dt] = system.spy.mock.calls[0] as [Entity[], number];
      expect(entities).toContain(eMatch);
      expect(entities).not.toContain(eNoMatch);
      expect(dt).toBe(16);
    });

    it('executa systems em ordem crescente de priority', () => {
      const order: number[] = [];

      class LowPrioSystem extends System {
        priority = 10;
        update(): void {
          order.push(10);
        }
      }

      class HighPrioSystem extends System {
        priority = 1;
        update(): void {
          order.push(1);
        }
      }

      // Adicionados fora de ordem — o world deve reordenar por priority
      world.addSystem(new LowPrioSystem());
      world.addSystem(new HighPrioSystem());
      world.tick(16);

      expect(order).toEqual([1, 10]);
    });

    it('system sem requiredComponents recebe todas as entities', () => {
      const system = new AnySystem();
      world.addSystem(system);

      world.createEntity();
      world.createEntity();
      world.createEntity();

      world.tick(16);

      const [entities] = system.spy.mock.calls[0] as [Entity[]];
      expect(entities).toHaveLength(3);
    });

    it('não invoca update de system não registrado', () => {
      const system = new AnySystem();
      world.createEntity();
      world.tick(16);
      expect(system.spy).not.toHaveBeenCalled();
    });
  });

  // ── addSystem / removeSystem ──────────────────────────────────────────────

  describe('addSystem / removeSystem', () => {
    it('addSystem registra o system para execução no próximo tick', () => {
      const system = new AnySystem();
      world.addSystem(system);
      world.tick(1);
      expect(system.spy).toHaveBeenCalledTimes(1);
    });

    it('system removido não é invocado no tick seguinte', () => {
      const system = new AnySystem();
      world.addSystem(system);
      world.removeSystem(AnySystem);
      world.tick(1);
      expect(system.spy).not.toHaveBeenCalled();
    });

    it('removeSystem sem efeito quando o tipo não está registrado', () => {
      expect(() => world.removeSystem(AnySystem)).not.toThrow();
    });
  });
});
