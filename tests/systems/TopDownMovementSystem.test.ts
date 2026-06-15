/**
 * Testes do TopDownMovementSystem: move o player no plano XZ a partir do eixo
 * (readMove fornecido pelo jogo), vira na direção, clampa a diagonal mas preserva o
 * analógico, e marca o player como alvo da câmera.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { FollowCameraTargetComponent } from '../../src/components/FollowCameraTargetComponent.js';
import { TopDownMovementSystem } from '../../src/systems/TopDownMovementSystem.js';

/** Monta um mundo com 1 player (Transform + CharacterBody) + o sistema. */
function setup(axis: { x: number; y: number }, moveSpeed = 5): { world: World; t: TransformComponent; axis: { x: number; y: number } } {
  const world = new World();
  world.addSystem(new TopDownMovementSystem(() => axis, { moveSpeed }));
  const e = world.createEntity();
  const t = new TransformComponent(0, 0, 0);
  e.addComponent(t);
  e.addComponent(new CharacterBodyComponent());
  return { world, t, axis };
}

describe('TopDownMovementSystem', () => {
  it('move no plano XZ na velocidade dada (y do eixo → −Z)', () => {
    const { world, t } = setup({ x: 1, y: 0 }, 5);
    world.tick(1000); // 1s
    expect(t.x).toBeCloseTo(5); // moveSpeed * 1s
    expect(t.z).toBeCloseTo(0);

    const up = setup({ x: 0, y: -1 }, 5); // "cima na tela" = −Z
    up.world.tick(1000);
    expect(up.t.z).toBeCloseTo(-5);
  });

  it('não toca no Y (quem cuida do Y é a física do Character)', () => {
    const { world, t } = setup({ x: 1, y: 1 });
    world.tick(500);
    expect(t.y).toBe(0);
  });

  it('vira na direção do movimento (rotationY = atan2(dx, dz))', () => {
    const { world, t } = setup({ x: 1, y: 0 });
    world.tick(16);
    expect(t.rotationY).toBeCloseTo(Math.atan2(1, 0)); // π/2 (direita)
  });

  it('clampa a diagonal (não acelera): velocidade igual à de um eixo só', () => {
    const diag = setup({ x: 1, y: 1 }, 5);
    diag.world.tick(1000);
    const dist = Math.hypot(diag.t.x, diag.t.z);
    expect(dist).toBeCloseTo(5); // não 5*√2
  });

  it('preserva o analógico: meio-tilt anda metade', () => {
    const half = setup({ x: 0.5, y: 0 }, 5);
    half.world.tick(1000);
    expect(half.t.x).toBeCloseTo(2.5); // metade da distância
  });

  it('eixo zerado = não move e não vira', () => {
    const { world, t } = setup({ x: 0, y: 0 });
    t.rotationY = 1.23;
    world.tick(16);
    expect(t.x).toBe(0);
    expect(t.z).toBe(0);
    expect(t.rotationY).toBe(1.23); // mantém (não recalcula sem movimento)
  });

  it('moveSpeed pode ser função lida por frame (marcha walk/run)', () => {
    const axis = { x: 1, y: 0 };
    let speed = 2; // walk
    const world = new World();
    world.addSystem(new TopDownMovementSystem(() => axis, { moveSpeed: () => speed }));
    const e = world.createEntity();
    const t = new TransformComponent(0, 0, 0);
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent());

    world.tick(1000);
    expect(t.x).toBeCloseTo(2); // andou na velocidade walk

    speed = 5; // run (a função é relida no próximo frame)
    world.tick(1000);
    expect(t.x).toBeCloseTo(2 + 5); // acelerou sem recriar o sistema
  });

  it('marca o player como alvo da câmera (FollowCameraTargetComponent) no 1º tick', () => {
    const world = new World();
    world.addSystem(new TopDownMovementSystem(() => ({ x: 0, y: 0 })));
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0));
    e.addComponent(new CharacterBodyComponent());
    expect(e.getComponent(FollowCameraTargetComponent)).toBeUndefined();
    world.tick(16);
    expect(e.getComponent(FollowCameraTargetComponent)).toBeDefined();
  });
});
