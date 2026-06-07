/**
 * Testes da física de plataforma (src/systems/PlatformerPhysicsSystem.ts).
 * Cobre: queda+pouso (grounded), pulo, bloqueio em parede e plataforma one-way.
 * Pura lógica ECS — roda em node, sem WebGPU. Ver pivô plataforma 2.5D.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { Entity } from '../../src/ecs/Entity.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { PlatformerBodyComponent } from '../../src/components/PlatformerBodyComponent.js';
import { PlatformerPhysicsSystem } from '../../src/systems/PlatformerPhysicsSystem.js';

function solid(world: World, x: number, y: number, hw: number, hh: number, oneWay = false): void {
  const e = world.createEntity();
  e.addComponent(new TransformComponent(x, y, 0));
  e.addComponent(new Collider2DComponent(hw, hh, true, oneWay));
}

function actor(world: World, x: number, y: number): { t: TransformComponent; b: PlatformerBodyComponent; e: Entity } {
  const e = world.createEntity();
  const t = new TransformComponent(x, y, 0);
  const b = new PlatformerBodyComponent();
  e.addComponent(t);
  e.addComponent(new Collider2DComponent(0.5, 0.5));
  e.addComponent(b);
  return { t, b, e };
}

function run(world: World, frames: number, dtMs = 16): void {
  for (let i = 0; i < frames; i++) world.tick(dtMs);
}

describe('PlatformerPhysicsSystem', () => {
  it('cai por gravidade e pousa no topo do chão (grounded)', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0, 50, 0.5); // chão: topo em y=0.5
    const p = actor(world, 0, 5); // player começa em y=5

    run(world, 150);

    expect(p.b.grounded).toBe(true);
    expect(p.t.y).toBeCloseTo(1.0, 1); // topo(0.5) + halfHeight do player(0.5)
  });

  it('pula quando no chão e sobe', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0, 50, 0.5);
    const p = actor(world, 0, 5);
    run(world, 150); // aterrissa
    expect(p.b.grounded).toBe(true);

    p.b.jumpQueued = true;
    world.tick(16);
    expect(p.b.vy).toBeGreaterThan(0); // ganhou velocidade de pulo
    const yAfterJump = p.t.y;
    run(world, 10);
    expect(p.t.y).toBeGreaterThan(yAfterJump); // subiu
    expect(p.b.grounded).toBe(false);
  });

  it('é bloqueado por uma parede ao mover na horizontal', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0, 50, 0.5); // chão
    solid(world, 2, 1, 0.5, 2); // parede: borda esquerda em x=1.5
    const p = actor(world, 0, 5);
    run(world, 150); // aterrissa
    p.b.moveDir = 1; // anda pra direita contra a parede
    run(world, 120);

    expect(p.t.x).toBeLessThanOrEqual(1.01); // parou em 1.5 - 0.5 = 1.0
  });

  it('plataforma one-way: pousa vindo de cima', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0, 50, 0.5, true); // one-way, topo em 0.5
    const p = actor(world, 0, 5);
    run(world, 150);
    expect(p.b.grounded).toBe(true);
    expect(p.t.y).toBeCloseTo(1.0, 1);
  });

  it('NÃO trata como parede quando a penetração é vertical (anti wall-trap)', () => {
    // Player levemente afundado no topo dum chão SÓLIDO (não oneWay): penetração
    // Y minúscula, X enorme → X-resolve deve PULAR (senão teleporta pra borda).
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0, 50, 0.5); // chão sólido largo, topo em 0.5
    const p = actor(world, 0, 0.99); // afundado ~0.01u no topo
    p.b.moveDir = 1; // tenta andar pra direita
    world.tick(16);
    // Sem o fix, o X-resolve empurraria pra x = -50.5 (borda esquerda). Com o fix,
    // o player só avança normalmente.
    expect(p.t.x).toBeGreaterThan(0);
    expect(p.t.x).toBeLessThan(1);
  });

  it('respeita offsetY do collider (sub-região tipo "deck")', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    // Transform em y=0, mas o AABB fino é deslocado pra cima (offsetY=2): topo em 2.2.
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0));
    e.addComponent(new Collider2DComponent(50, 0.2, true, false, 0, 2));
    const p = actor(world, 0, 6);
    run(world, 150);
    expect(p.b.grounded).toBe(true);
    expect(p.t.y).toBeCloseTo(2.7, 1); // topo efetivo 2.2 + halfH player 0.5
  });

  it('player (box) pousa em cima de um collider CÍRCULO', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0));
    e.addComponent(new Collider2DComponent(1, 1, true, false, 0, 0, 'circle')); // raio 1, topo y=1
    const p = actor(world, 0, 5);
    run(world, 200);
    expect(p.b.grounded).toBe(true);
    expect(p.t.y).toBeCloseTo(1.5, 1); // base do box (0.5) no topo do círculo (1.0)
  });

  it('player CÍRCULO pousa no chão (box)', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0, 50, 0.5); // chão box, topo 0.5
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const b = new PlatformerBodyComponent();
    e.addComponent(t);
    e.addComponent(new Collider2DComponent(0.5, 0.5, true, false, 0, 0, 'circle'));
    e.addComponent(b);
    run(world, 200);
    expect(b.grounded).toBe(true);
    expect(t.y).toBeCloseTo(1.0, 1); // raio 0.5 sobre o topo 0.5
  });

  it('player segue a curva de um heightfield (afunda no meio)', () => {
    const land = (startX: number): { t: TransformComponent; b: PlatformerBodyComponent } => {
      const world = new World();
      world.addSystem(new PlatformerPhysicsSystem());
      const e = world.createEntity();
      e.addComponent(new TransformComponent(0, 0, 0));
      // perfil que afunda no meio: pontas em y=1, centro em y=-0.5
      e.addComponent(
        new Collider2DComponent(5, 1, true, false, 0, 0, 'heightfield', [[-5, 1], [0, -0.5], [5, 1]]),
      );
      const p = actor(world, startX, 6);
      run(world, 200);
      return p;
    };
    const mid = land(0);
    const edge = land(-4.5);
    expect(mid.b.grounded).toBe(true);
    expect(edge.b.grounded).toBe(true);
    expect(mid.t.y).toBeLessThan(edge.t.y); // o meio fica mais baixo (segue a curva)
  });

  it('plataforma one-way: não bloqueia vindo de baixo (subindo)', () => {
    const world = new World();
    world.addSystem(new PlatformerPhysicsSystem());
    solid(world, 0, 0.8, 5, 0.5, true); // one-way em y=0.8 (topo 1.3)
    const p = actor(world, 0, 0); // sobreposto, base abaixo do topo
    p.b.vy = 5; // subindo
    world.tick(16);

    expect(p.b.grounded).toBe(false); // atravessou (não pousou)
  });
});
