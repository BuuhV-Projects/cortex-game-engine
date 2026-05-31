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

// ─── Colisão sphere ↔ sphere (ADR-0027 Fase 3) ───────────────────────────────

/** Cria uma Entity com RigidBody + Collider em shape sphere. */
function makeSphere(opts: {
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  mass?: number; isStatic?: boolean;
  radius?: number;
} = {}): Entity {
  const entity = new Entity();
  const r = new RigidBodyComponent();
  r.position.x = opts.x ?? 0; r.position.y = opts.y ?? 0; r.position.z = opts.z ?? 0;
  r.velocity.x = opts.vx ?? 0; r.velocity.y = opts.vy ?? 0; r.velocity.z = opts.vz ?? 0;
  r.mass = opts.mass ?? 1;
  r.isStatic = opts.isStatic ?? false;
  entity.addComponent(r);
  const col = new ColliderComponent();
  col.shape = { kind: 'sphere', radius: opts.radius ?? 0.5 };
  entity.addComponent(col);
  return entity;
}

describe('PhysicsSystem — colisão sphere ↔ sphere', () => {
  let system: PhysicsSystem;

  beforeEach(() => {
    system = new PhysicsSystem();
    system.gravity = 0;
  });

  it('não colide quando a distância entre centros é maior que rA + rB', () => {
    const a = makeSphere({ x: 0,   radius: 0.5 });
    const b = makeSphere({ x: 1.5, radius: 0.5 }); // distância 1.5, soma 1.0
    system.update([a, b], 16.67);
    expect(rb(a).position.x).toBe(0);
    expect(rb(b).position.x).toBe(1.5);
  });

  it('separa duas esferas dinâmicas em XY arbitrário (normal diagonal)', () => {
    // A em (0,0), B em (0.6, 0.6) — penetração ao longo da diagonal (45°)
    const a = makeSphere({ x: 0,   y: 0,   radius: 0.5 });
    const b = makeSphere({ x: 0.6, y: 0.6, radius: 0.5 });
    system.update([a, b], 16.67);
    // Centros devem estar separados por exatamente rA+rB = 1 após resolução
    const dx = rb(a).position.x - rb(b).position.x;
    const dy = rb(a).position.y - rb(b).position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(1.0, 5);
  });

  it('esfera dinâmica é empurrada por esfera estática (sem mover a estática)', () => {
    const dyn    = makeSphere({ x: 0,    radius: 0.5 });
    const stat   = makeSphere({ x: 0.6, radius: 0.5, isStatic: true });
    system.update([dyn, stat], 16.67);
    expect(rb(stat).position.x).toBe(0.6);
    // dyn empurrado pra -X até distância = 1.0
    expect(rb(dyn).position.x).toBeCloseTo(-0.4, 5);
  });

  it('zera velocidade do dinâmico na direção do normal ao colidir com estática', () => {
    const dyn  = makeSphere({ x: 0,   vx: 5, radius: 0.5 });
    const stat = makeSphere({ x: 0.6, isStatic: true, radius: 0.5 });
    system.update([dyn, stat], 16.67);
    // Normal aponta -X (de stat → dyn é -X). vx era 5 → zera componente.
    expect(rb(dyn).velocity.x).toBeCloseTo(0, 5);
  });

  it('preserva velocidade tangencial ao plano de colisão', () => {
    // dyn com componente vy tangencial; vx puxa contra a stat. Após
    // colisão, vx é zerada na direção do normal mas vy quase intacta.
    // Tolerância porque a integração move 1 passo antes da resolução,
    // tornando o normal levemente desviado do eixo X puro.
    const dyn  = makeSphere({ x: 0,   vx: 5, vy: 3, radius: 0.5 });
    const stat = makeSphere({ x: 0.6, isStatic: true, radius: 0.5 });
    system.update([dyn, stat], 16.67);
    expect(rb(dyn).velocity.y).toBeCloseTo(3, 0); // dentro de ±0.5
  });
});

// ─── Colisão box ↔ sphere (ADR-0027 Fase 3) ──────────────────────────────────

describe('PhysicsSystem — colisão box ↔ sphere', () => {
  let system: PhysicsSystem;

  beforeEach(() => {
    system = new PhysicsSystem();
    system.gravity = 0;
  });

  it('esfera não colide quando está longe da box', () => {
    const box    = makeEntity({ x: 0, sizeX: 1, sizeY: 1, sizeZ: 1 });
    const sphere = makeSphere({ x: 5, radius: 0.5 });
    system.update([box, sphere], 16.67);
    expect(rb(sphere).position.x).toBe(5);
  });

  it('esfera colide com canto da box e é empurrada na direção do canto', () => {
    // Box (0,0,0) size 1 → cantos em ±0.5. Sphere centro em (0.7, 0.7, 0) r=0.3.
    // Closest point on box = (0.5, 0.5, 0); distância ao centro = √0.08 ≈ 0.283 < 0.3.
    const box    = makeEntity({ x: 0,   y: 0,   z: 0, isStatic: true, sizeX: 1, sizeY: 1, sizeZ: 1 });
    const sphere = makeSphere({ x: 0.7, y: 0.7, z: 0, radius: 0.3 });
    system.update([box, sphere], 16.67);
    // Esfera empurrada pra fora ao longo da diagonal XY → centro mais longe da box
    const dx = rb(sphere).position.x - rb(box).position.x;
    const dy = rb(sphere).position.y - rb(box).position.y;
    expect(dx).toBeGreaterThan(0.7);
    expect(dy).toBeGreaterThan(0.7);
  });

  it('esfera batendo na face da box é empurrada perpendicular à face', () => {
    // Sphere a +X da box → normal aponta +X (esfera empurrada pra +X).
    const box    = makeEntity({ x: 0,   sizeX: 1, sizeY: 1, sizeZ: 1, isStatic: true });
    const sphere = makeSphere({ x: 0.7, radius: 0.5 }); // overlap 0.3 no eixo X
    system.update([box, sphere], 16.67);
    expect(rb(sphere).position.x).toBeCloseTo(1.0, 5); // 0.5 (face) + 0.5 (raio)
    expect(rb(sphere).position.y).toBe(0);
    expect(rb(sphere).position.z).toBe(0);
  });

  it('zera componente perpendicular da velocidade na colisão box↔sphere', () => {
    const box    = makeEntity({ x: 0,   sizeX: 1, sizeY: 1, sizeZ: 1, isStatic: true });
    const sphere = makeSphere({ x: 0.7, vx: -5, vy: 2, radius: 0.5 });
    system.update([box, sphere], 16.67);
    // Normal aponta +X (esfera tá a +X da box e foi empurrada pra +X).
    // vx era -5 (na direção da box). Após colisão: zerada na direção do normal.
    expect(rb(sphere).velocity.x).toBeCloseTo(0, 5);
    expect(rb(sphere).velocity.y).toBe(2); // tangencial intacta
  });
});

// ─── Colisão cylinder (ADR-0027 Fase 4) ──────────────────────────────────────

/** Cria uma Entity com shape cylinder vertical (eixo Y). */
function makeCylinder(opts: {
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  isStatic?: boolean;
  radius?: number; height?: number;
} = {}): Entity {
  const entity = new Entity();
  const r = new RigidBodyComponent();
  r.position.x = opts.x ?? 0; r.position.y = opts.y ?? 0; r.position.z = opts.z ?? 0;
  r.velocity.x = opts.vx ?? 0; r.velocity.y = opts.vy ?? 0; r.velocity.z = opts.vz ?? 0;
  r.isStatic = opts.isStatic ?? false;
  entity.addComponent(r);
  const col = new ColliderComponent();
  col.shape = { kind: 'cylinder', radius: opts.radius ?? 0.5, height: opts.height ?? 1.0 };
  entity.addComponent(col);
  return entity;
}

describe('PhysicsSystem — colisão cylinder ↔ cylinder', () => {
  let system: PhysicsSystem;
  beforeEach(() => { system = new PhysicsSystem(); system.gravity = 0; });

  it('não colide quando distância XZ > rA+rB', () => {
    const a = makeCylinder({ x: 0,   radius: 0.5, height: 2 });
    const b = makeCylinder({ x: 1.5, radius: 0.5, height: 2 });
    system.update([a, b], 16.67);
    expect(rb(a).position.x).toBe(0);
    expect(rb(b).position.x).toBe(1.5);
  });

  it('não colide quando Y separa (acima/abaixo) mesmo com XZ sobreposto', () => {
    const a = makeCylinder({ x: 0, y: 0, radius: 0.5, height: 1 }); // y∈[-0.5, 0.5]
    const b = makeCylinder({ x: 0, y: 3, radius: 0.5, height: 1 }); // y∈[ 2.5, 3.5]
    system.update([a, b], 16.67);
    expect(rb(a).position.y).toBeCloseTo(0, 5);
    expect(rb(b).position.y).toBeCloseTo(3, 5);
  });

  it('separa radialmente quando overlap XZ < overlap Y (MTV horizontal)', () => {
    const a = makeCylinder({ x: 0,   y: 0, radius: 0.5, height: 5 });
    const b = makeCylinder({ x: 0.6, y: 0, radius: 0.5, height: 5, isStatic: true });
    // overlap XZ = 0.4, overlap Y = 5 → separação radial
    system.update([a, b], 16.67);
    expect(rb(a).position.x).toBeCloseTo(-0.4, 5);
  });

  it('separa verticalmente quando overlap Y < overlap XZ (MTV vertical)', () => {
    const a = makeCylinder({ x: 0, y: 0,    radius: 5, height: 1 });
    const b = makeCylinder({ x: 0, y: 0.6,  radius: 5, height: 1, isStatic: true });
    // overlap XZ = 10 (raio total), overlap Y = 0.4 → MTV vertical
    system.update([a, b], 16.67);
    expect(rb(a).position.y).toBeCloseTo(-0.4, 5);
  });
});

describe('PhysicsSystem — colisão box ↔ cylinder', () => {
  let system: PhysicsSystem;
  beforeEach(() => { system = new PhysicsSystem(); system.gravity = 0; });

  it('cilindro batendo na face X da box é empurrado em +X', () => {
    const box = makeEntity({ x: 0, sizeX: 1, sizeY: 5, sizeZ: 5, isStatic: true });
    const cyl = makeCylinder({ x: 0.7, y: 0, radius: 0.5, height: 1 }); // overlap radial = 0.3
    system.update([box, cyl], 16.67);
    expect(rb(cyl).position.x).toBeCloseTo(1.0, 5); // face em 0.5 + raio 0.5
  });

  it('cilindro acima da box assenta na superfície (MTV vertical)', () => {
    const box = makeEntity({ x: 0, y: 0,  sizeX: 5, sizeY: 1, sizeZ: 5, isStatic: true });
    const cyl = makeCylinder({ x: 0, y: 0.7, radius: 0.3, height: 1 }); // overlap Y=0.3, overlap radial grande
    system.update([box, cyl], 16.67);
    // Cilindro empurrado pra +Y até base na superfície da box (y=0.5) + h/2 = 1.0
    expect(rb(cyl).position.y).toBeCloseTo(1.0, 5);
  });

  it('cilindro fora do range Y da box não colide', () => {
    const box = makeEntity({ x: 0, y: 0, sizeX: 1, sizeY: 1, sizeZ: 1, isStatic: true });
    const cyl = makeCylinder({ x: 0, y: 3, radius: 0.5, height: 1 });
    system.update([box, cyl], 16.67);
    expect(rb(cyl).position.y).toBeCloseTo(3, 5);
  });
});

describe('PhysicsSystem — colisão sphere ↔ cylinder', () => {
  let system: PhysicsSystem;
  beforeEach(() => { system = new PhysicsSystem(); system.gravity = 0; });

  it('esfera batendo lateralmente no cilindro é empurrada radialmente', () => {
    const cyl    = makeCylinder({ x: 0,   y: 0,   radius: 0.5, height: 5, isStatic: true });
    const sphere = makeSphere({ x: 0.7, y: 0,   radius: 0.5 }); // dist XZ = 0.7, soma = 1.0
    system.update([cyl, sphere], 16.67);
    // Esfera empurrada pra +X até centerSphere.x = 1.0
    expect(rb(sphere).position.x).toBeCloseTo(1.0, 5);
    expect(rb(sphere).position.y).toBeCloseTo(0, 5);
  });

  it('esfera caindo no topo do cilindro é empurrada pra cima', () => {
    const cyl    = makeCylinder({ x: 0, y: 0,   radius: 0.5, height: 1, isStatic: true }); // topo em y=0.5
    const sphere = makeSphere({ x: 0, y: 0.7, radius: 0.3 }); // overlap vertical
    system.update([cyl, sphere], 16.67);
    expect(rb(sphere).position.y).toBeCloseTo(0.8, 5); // 0.5 (topo) + 0.3 (raio)
  });

  it('esfera longe do cilindro não colide', () => {
    const cyl    = makeCylinder({ x: 0, radius: 0.5, height: 1, isStatic: true });
    const sphere = makeSphere({ x: 5, radius: 0.5 });
    system.update([cyl, sphere], 16.67);
    expect(rb(sphere).position.x).toBe(5);
  });
});
