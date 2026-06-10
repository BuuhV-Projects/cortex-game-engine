/**
 * Testes da colisão com terreno (Terrain.heightAt + TerrainCollisionSystem):
 * amostra de altura por interpolação, e o corpo sendo mantido EM CIMA da
 * superfície (aterrado) — base do "terreno sólido por padrão".
 */
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { Terrain } from '../../src/scene/Terrain.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { KinematicBodyComponent } from '../../src/components/KinematicBodyComponent.js';
import { PlatformerBodyComponent } from '../../src/components/PlatformerBodyComponent.js';
import { TerrainComponent } from '../../src/components/TerrainComponent.js';
import { TerrainCollisionSystem } from '../../src/systems/TerrainCollisionSystem.js';

describe('Terrain.heightAt', () => {
  it('plano = 0; fora da área = null', () => {
    const t = new Terrain({ size: 10, resolution: 4 });
    expect(t.heightAt(0, 0)).toBe(0);
    expect(t.heightAt(2, -3)).toBe(0);
    expect(t.heightAt(6, 0)).toBeNull(); // fora (metade = 5)
  });

  it('interpola a altura (morro no centro)', () => {
    const t = new Terrain({ size: 20, resolution: 20 }); // 1u por vértice
    t.sculpt(0, 0, 6, 4); // levanta no centro
    const center = t.heightAt(0, 0)!;
    const near = t.heightAt(2, 0)!;
    const far = t.heightAt(5, 0)!;
    expect(center).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });
});

describe('TerrainCollisionSystem', () => {
  function setup() {
    const world = new World();
    world.addSystem(new TerrainCollisionSystem());
    const terrain = new Terrain({ size: 20, resolution: 20 });
    const te = world.createEntity();
    te.addComponent(new TerrainComponent(terrain, terrain.mesh));
    return { world, terrain };
  }

  it('sobe um corpo que está abaixo da superfície e o aterra (KinematicBody)', () => {
    const { world, terrain } = setup();
    terrain.sculpt(0, 0, 8, 3); // morro: superfície > 0 no centro
    const e = world.createEntity();
    const t = new TransformComponent(0, -5, 0); // bem abaixo
    const kb = new KinematicBodyComponent();
    kb.velocityY = -10; // caindo
    e.addComponent(t);
    e.addComponent(kb);

    world.tick(16);
    expect(t.y).toBeGreaterThan(0); // subiu pra superfície (centro do morro)
    expect(t.y).toBeCloseTo(terrain.heightAt(0, 0)!);
    expect(kb.grounded).toBe(true);
    expect(kb.velocityY).toBe(0);
  });

  it('não mexe num corpo ACIMA da superfície (não cola pra baixo)', () => {
    const { world } = setup();
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0); // acima do plano (0)
    e.addComponent(t);
    e.addComponent(new KinematicBodyComponent());
    world.tick(16);
    expect(t.y).toBe(5); // intocado
  });

  it('ignora corpos FORA da área do terreno', () => {
    const { world } = setup();
    const e = world.createEntity();
    const t = new TransformComponent(100, -5, 0); // longe (fora)
    e.addComponent(t);
    e.addComponent(new PlatformerBodyComponent());
    world.tick(16);
    expect(t.y).toBe(-5); // não foi subido (não há terreno ali)
  });
});
