/**
 * Testes unitários para Physics (src/core/Physics.ts)
 *
 * Cobre: gravidade, integração, corpo estático imóvel e resolução de colisão
 * AABB (separação posicional + zeragem de velocidade na normal de colisão).
 * Roda em Node.js via vitest — sem dependências externas.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RigidBodyComponent,
  ColliderComponent,
  PhysicsSystem,
} from '../../src/core/Physics.js';
import { Entity } from '../../src/ecs/Entity.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Cria uma Entity já equipada com RigidBody e Collider configuráveis. */
function makeEntity(opts: {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  mass?: number;
  isStatic?: boolean;
  sizeX?: number;
  sizeY?: number;
  sizeZ?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
} = {}): Entity {
  const entity = new Entity();

  const rb = new RigidBodyComponent();
  rb.position.x = opts.x ?? 0;
  rb.position.y = opts.y ?? 0;
  rb.position.z = opts.z ?? 0;
  rb.velocity.x = opts.vx ?? 0;
  rb.velocity.y = opts.vy ?? 0;
  rb.velocity.z = opts.vz ?? 0;
  rb.mass = opts.mass ?? 1;
  rb.isStatic = opts.isStatic ?? false;
  entity.addComponent(rb);

  const col = new ColliderComponent();
  col.size.x = opts.sizeX ?? 1;
  col.size.y = opts.sizeY ?? 1;
  col.size.z = opts.sizeZ ?? 1;
  col.offset.x = opts.offsetX ?? 0;
  col.offset.y = opts.offsetY ?? 0;
  col.offset.z = opts.offsetZ ?? 0;
  entity.addComponent(col);

  return entity;
}

/** Extrai o RigidBodyComponent de uma entity. */
function rb(entity: Entity): RigidBodyComponent {
  return entity.getComponent(RigidBodyComponent)!;
}

// ─── testes ──────────────────────────────────────────────────────────────────

describe('RigidBodyComponent', () => {
  it('possui valores padrão corretos', () => {
    const c = new RigidBodyComponent();
    expect(c.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.mass).toBe(1);
    expect(c.isStatic).toBe(false);
    expect(c.enabled).toBe(true);
  });
});

describe('ColliderComponent', () => {
  it('possui valores padrão corretos', () => {
    const c = new ColliderComponent();
    expect(c.size).toEqual({ x: 1, y: 1, z: 1 });
    expect(c.offset).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.enabled).toBe(true);
  });
});

describe('PhysicsSystem — gravidade e integração', () => {
  let system: PhysicsSystem;

  beforeEach(() => {
    system = new PhysicsSystem();
  });

  // ── 1. Gravidade aplicada a corpo dinâmico ──────────────────────────────

  it('aplica gravidade (−Y) à velocidade de um corpo dinâmico', () => {
    const entity = makeEntity({ vy: 0 });
    system.update([entity], 1000); // 1 s

    // velocity.y deve diminuir em gravity (9.8)
    expect(rb(entity).velocity.y).toBeCloseTo(-9.8, 5);
  });

  it('gravidade configúravel é respeitada', () => {
    system.gravity = 20;
    const entity = makeEntity({ vy: 0 });
    system.update([entity], 500); // 0.5 s

    expect(rb(entity).velocity.y).toBeCloseTo(-10, 5); // 20 * 0.5
  });

  it('integra posição pelo deltaTime', () => {
    // Corpo sem gravidade para isolar a integração de posição
    system.gravity = 0;
    const entity = makeEntity({ vx: 3, vy: -2, vz: 1 });
    system.update([entity], 2000); // 2 s

    expect(rb(entity).position.x).toBeCloseTo(6, 5);  // 3 * 2
    expect(rb(entity).position.y).toBeCloseTo(-4, 5); // -2 * 2
    expect(rb(entity).position.z).toBeCloseTo(2, 5);  // 1 * 2
  });

  // ── 2. Corpo estático não se move ───────────────────────────────────────

  it('corpo estático não recebe gravidade', () => {
    const entity = makeEntity({ isStatic: true, vy: 0 });
    system.update([entity], 1000);

    expect(rb(entity).velocity.y).toBe(0);
  });

  it('corpo estático não muda de posição', () => {
    const entity = makeEntity({ x: 5, y: 3, z: -1, isStatic: true });
    system.update([entity], 1000);

    expect(rb(entity).position).toEqual({ x: 5, y: 3, z: -1 });
  });

  it('componente RigidBody desativado não recebe gravidade', () => {
    const entity = makeEntity({ vy: 0 });
    entity.getComponent(RigidBodyComponent)!.enabled = false;
    system.update([entity], 1000);

    expect(rb(entity).velocity.y).toBe(0);
  });
});

describe('PhysicsSystem — resolução de colisão AABB', () => {
  let system: PhysicsSystem;

  beforeEach(() => {
    system = new PhysicsSystem();
    system.gravity = 0; // isola a colisão
  });

  // ── 3. Separação posicional em colisão dinâmico × estático ─────────────

  it('separa um corpo dinâmico que penetra um corpo estático (eixo Y)', () => {
    // Chão estático em y=0, tamanho 1 → AABB cobre [-0.5, 0.5]
    const floor = makeEntity({ y: 0, isStatic: true, sizeX: 10, sizeY: 1, sizeZ: 10 });
    // Bola dinâmica em y=0.4, tamanho 1 → AABB cobre [-0.1, 0.9]  (penetração=0.1 em Y)
    const ball = makeEntity({ y: 0.4, vy: -2 });

    system.update([ball, floor], 0); // dt=0 → apenas colisão, sem integração

    // Bola deve ter sido empurrada para cima (fora do chão)
    expect(rb(ball).position.y).toBeGreaterThanOrEqual(0.5);
  });

  it('separa dois corpos dinâmicos igualmente (mesma massa)', () => {
    // Dois cubos 1×1×1 sobrepostos em X com penetração de 0.4
    const a = makeEntity({ x: 0 });
    const b = makeEntity({ x: 0.6 }); // penetração X = 1 - 0.6 = 0.4

    system.update([a, b], 0);

    const posA = rb(a).position.x;
    const posB = rb(b).position.x;
    // Devem estar separados (distância entre centros ≥ 1.0, largura dos cubos)
    expect(posB - posA).toBeCloseTo(1.0, 4);
  });

  it('par estático-estático não altera posições', () => {
    const a = makeEntity({ x: 0, isStatic: true });
    const b = makeEntity({ x: 0.5, isStatic: true }); // sobrepondo

    system.update([a, b], 0);

    expect(rb(a).position.x).toBe(0);
    expect(rb(b).position.x).toBe(0.5);
  });

  // ── 4. Velocidade zeroed na normal de colisão (dinâmico × estático) ────

  it('zeroa velocidade Y do corpo dinâmico ao colidir com chão estático', () => {
    const floor = makeEntity({ y: 0, isStatic: true, sizeX: 10, sizeY: 1, sizeZ: 10 });
    const ball = makeEntity({ y: 0.4, vy: -5 }); // caindo em direção ao chão

    system.update([ball, floor], 0);

    // Componente Y da velocidade deve ser zerada (colisão pelo eixo Y)
    expect(rb(ball).velocity.y).toBe(0);
    // Componentes X e Z não devem ser afetados
    expect(rb(ball).velocity.x).toBe(0);
    expect(rb(ball).velocity.z).toBe(0);
  });

  it('mantém velocidades em eixos não colididos (colisão X)', () => {
    // Dois cubos colidindo em X; velocidade Y/Z não deve mudar
    const a = makeEntity({ x: 0,   vx: 2, vy: 1, vz: -1 });
    const b = makeEntity({ x: 0.6, vx: -2, vy: 3, vz: 2 }); // penetração X

    system.update([a, b], 0);

    // Vy e Vz permanecem intactos nos dois corpos
    expect(rb(a).velocity.y).toBeCloseTo(1,  5);
    expect(rb(a).velocity.z).toBeCloseTo(-1, 5);
    expect(rb(b).velocity.y).toBeCloseTo(3,  5);
    expect(rb(b).velocity.z).toBeCloseTo(2,  5);
  });

  // ── 5. Impulso elástico ponderado por massa (dinâmico × dinâmico) ──────

  it('conserva momentum linear em colisão dinâmico-dinâmico', () => {
    // Corpos de massas iguais a 2 e 4
    const a = makeEntity({ x: 0,   vx: 4,  mass: 2 });
    const b = makeEntity({ x: 0.6, vx: -2, mass: 4 }); // penetração X

    const pBefore =
      rb(a).mass * rb(a).velocity.x + rb(b).mass * rb(b).velocity.x;

    system.update([a, b], 0);

    const pAfter =
      rb(a).mass * rb(a).velocity.x + rb(b).mass * rb(b).velocity.x;

    expect(pAfter).toBeCloseTo(pBefore, 5);
  });

  it('corpo mais pesado muda menos de velocidade em colisão', () => {
    // Bola leve (mass=1) bate em muro pesado (mass=100), ambos dinâmicos
    const light = makeEntity({ x: 0,   vx: 5,  mass: 1 });
    const heavy = makeEntity({ x: 0.6, vx: 0,  mass: 100 }); // penetração X

    const heavyVxBefore = rb(heavy).velocity.x;
    system.update([light, heavy], 0);

    const heavyVxAfter = rb(heavy).velocity.x;
    const lightVxAfter = rb(light).velocity.x;

    // Muro pesado muda muito pouco
    expect(Math.abs(heavyVxAfter - heavyVxBefore)).toBeLessThan(0.5);
    // Bola leve reverte (ou quase) sua direção
    expect(lightVxAfter).toBeLessThan(0);
  });

  // ── 6. Collider desativado não participa da colisão ────────────────────

  it('collider desativado ignora colisão', () => {
    const floor = makeEntity({ y: 0, isStatic: true, sizeX: 10, sizeY: 1, sizeZ: 10 });
    const ball = makeEntity({ y: 0.4, vy: -5 });
    ball.getComponent(ColliderComponent)!.enabled = false;

    system.update([ball, floor], 0);

    // Sem colisão → velocidade intacta
    expect(rb(ball).velocity.y).toBe(-5);
  });
});
