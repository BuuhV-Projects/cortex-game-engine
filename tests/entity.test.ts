/**
 * Testes unitários para Entity (src/ecs/Entity.ts)
 * Cobre: addComponent, removeComponent, hasComponent, getComponent, getAllComponents.
 * Referência: ADR-0002.
 */

import { describe, it, expect } from 'vitest';
import { Entity } from '../src/ecs/Entity.js';
import { Component } from '../src/ecs/Component.js';

// ─── Componentes de teste ──────────────────────────────────────────────────

class PositionComponent extends Component {
  x = 0;
  y = 0;
}

class VelocityComponent extends Component {
  vx = 0;
  vy = 0;
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('Entity', () => {
  it('possui id único (UUID) ao ser criada', () => {
    const e1 = new Entity();
    const e2 = new Entity();
    expect(typeof e1.id).toBe('string');
    expect(e1.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(e1.id).not.toBe(e2.id);
  });

  // ── addComponent ─────────────────────────────────────────────────────────

  describe('addComponent', () => {
    it('adiciona um componente à entidade', () => {
      const entity = new Entity();
      entity.addComponent(new PositionComponent());
      expect(entity.hasComponent(PositionComponent)).toBe(true);
    });

    it('substitui componente do mesmo tipo ao adicionar novamente', () => {
      const entity = new Entity();
      const first = new PositionComponent();
      first.x = 1;
      const second = new PositionComponent();
      second.x = 99;
      entity.addComponent(first);
      entity.addComponent(second);
      expect(entity.getComponent(PositionComponent)?.x).toBe(99);
    });

    it('retorna a própria entidade para encadeamento (method chaining)', () => {
      const entity = new Entity();
      const result = entity.addComponent(new PositionComponent());
      expect(result).toBe(entity);
    });

    it('suporta encadeamento de múltiplos componentes', () => {
      const entity = new Entity();
      entity
        .addComponent(new PositionComponent())
        .addComponent(new VelocityComponent());
      expect(entity.hasComponent(PositionComponent)).toBe(true);
      expect(entity.hasComponent(VelocityComponent)).toBe(true);
    });
  });

  // ── removeComponent ──────────────────────────────────────────────────────

  describe('removeComponent', () => {
    it('remove um componente existente', () => {
      const entity = new Entity();
      entity.addComponent(new PositionComponent());
      entity.removeComponent(PositionComponent);
      expect(entity.hasComponent(PositionComponent)).toBe(false);
    });

    it('não lança erro ao remover componente inexistente', () => {
      const entity = new Entity();
      expect(() => entity.removeComponent(PositionComponent)).not.toThrow();
    });

    it('remove apenas o componente especificado, preservando os demais', () => {
      const entity = new Entity();
      entity.addComponent(new PositionComponent());
      entity.addComponent(new VelocityComponent());
      entity.removeComponent(PositionComponent);
      expect(entity.hasComponent(PositionComponent)).toBe(false);
      expect(entity.hasComponent(VelocityComponent)).toBe(true);
    });
  });

  // ── hasComponent ─────────────────────────────────────────────────────────

  describe('hasComponent', () => {
    it('retorna true quando o componente está presente', () => {
      const entity = new Entity();
      entity.addComponent(new PositionComponent());
      expect(entity.hasComponent(PositionComponent)).toBe(true);
    });

    it('retorna false quando o componente não está presente', () => {
      const entity = new Entity();
      expect(entity.hasComponent(PositionComponent)).toBe(false);
    });

    it('retorna false após o componente ser removido', () => {
      const entity = new Entity();
      entity.addComponent(new PositionComponent());
      entity.removeComponent(PositionComponent);
      expect(entity.hasComponent(PositionComponent)).toBe(false);
    });
  });

  // ── getComponent ─────────────────────────────────────────────────────────

  describe('getComponent', () => {
    it('retorna a instância correta do componente', () => {
      const entity = new Entity();
      const comp = new PositionComponent();
      comp.x = 42;
      entity.addComponent(comp);
      expect(entity.getComponent(PositionComponent)).toBe(comp);
      expect(entity.getComponent(PositionComponent)?.x).toBe(42);
    });

    it('retorna undefined quando o componente não está presente', () => {
      const entity = new Entity();
      expect(entity.getComponent(PositionComponent)).toBeUndefined();
    });
  });

  // ── getAllComponents ──────────────────────────────────────────────────────

  describe('getAllComponents', () => {
    it('retorna array vazio quando não há componentes', () => {
      const entity = new Entity();
      expect(entity.getAllComponents()).toHaveLength(0);
    });

    it('retorna todos os componentes adicionados', () => {
      const entity = new Entity();
      const pos = new PositionComponent();
      const vel = new VelocityComponent();
      entity.addComponent(pos).addComponent(vel);
      const all = entity.getAllComponents();
      expect(all).toHaveLength(2);
      expect(all).toContain(pos);
      expect(all).toContain(vel);
    });
  });
});
