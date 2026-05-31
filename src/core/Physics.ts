/**
 * Physics — sistema de física com colisão AABB sem dependências externas.
 *
 * Exporta:
 * - `RigidBodyComponent`: velocidade, massa e flag estático
 * - `ColliderComponent`:  tamanho e offset do AABB
 * - `PhysicsSystem`:      gravidade, integração e resolução de colisões
 *
 * Referência: ADR-0002 (ECS)
 */

import { Component } from '../ecs/Component.js';
import { Entity } from '../ecs/Entity.js';
import { System } from '../ecs/System.js';

// ─── Tipo auxiliar ─────────────────────────────────────────────────────────────

/** Vetor de três componentes usado internamente pelos componentes de física. */
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ─── RigidBodyComponent ────────────────────────────────────────────────────────

/**
 * Componente que armazena o estado físico de uma entidade.
 *
 * `position` representa o centro de massa do corpo no espaço mundial.
 * `velocity` é expresso em unidades/s — o `PhysicsSystem` converte `deltaTime`
 * de ms para segundos antes de integrar.
 *
 * Quando a entidade também possui um componente de transform de renderização,
 * cabe ao usuário sincronizar `position` com ele após cada tick de física.
 */
export class RigidBodyComponent extends Component {
  /** Centro de massa do corpo no espaço mundial. */
  position: Vec3 = { x: 0, y: 0, z: 0 };
  /** Velocidade linear em unidades/s. */
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  /** Massa do corpo em kg. Ignorada se `isStatic` for `true`. */
  mass: number = 1;
  /**
   * Quando `true`, o corpo não é movido nem recebe gravidade.
   * Ainda participa da detecção de colisão (comporta-se como superfície sólida).
   */
  isStatic: boolean = false;
}

// ─── ColliderShape ─────────────────────────────────────────────────────────────

/**
 * Forma geométrica do collider (ADR-0027).
 *
 * Discriminated union por `kind`. Sphere é o caso mais simples; cylinder e
 * capsule são sempre **vertical-aligned** (eixo Y) — cobre 95% dos casos
 * de jogo 3D em terreno horizontal sem precisar de orientação arbitrária
 * (OBB rotacionada fica pra v2, após o RigidBody ganhar rotation).
 *
 * `offset` desloca o centro do collider em relação a `RigidBodyComponent.position`.
 */
export type ColliderShape =
  | { kind: 'box';      size: Vec3;                            offset?: Vec3 }
  | { kind: 'sphere';   radius: number;                        offset?: Vec3 }
  | { kind: 'cylinder'; radius: number; height: number;        offset?: Vec3 }
  | { kind: 'capsule';  radius: number; height: number;        offset?: Vec3 };

// ─── ColliderComponent ─────────────────────────────────────────────────────────

/**
 * Componente que define o volume de colisão da entidade.
 *
 * Suporta múltiplas formas via `shape` (ADR-0027): box, sphere, cylinder,
 * capsule. O centro do collider é `RigidBodyComponent.position + shape.offset`.
 * Padrão: cubo 1×1×1 sem offset.
 *
 * Pra escolher um shape:
 * ```ts
 * const col = new ColliderComponent()
 * col.shape = { kind: 'sphere', radius: 0.5 }
 * // ou
 * col.shape = { kind: 'cylinder', radius: 0.4, height: 1.8 }
 * // ou
 * col.shape = { kind: 'capsule', radius: 0.25, height: 1.2 }  // h = altura do cilindro central
 * ```
 *
 * **Backwards-compat:** o acesso direto a `col.size` e `col.offset` continua
 * funcionando como antes:
 *  - `col.size = {x,y,z}` substitui o `shape` por um box com essas dimensões.
 *  - `col.size` (getter) retorna o **bounding box equivalente** ao shape atual
 *    (size literal pra box, `{2r,2r,2r}` pra sphere, `{2r,h,2r}` pra cylinder,
 *    `{2r, h+2r, 2r}` pra capsule). Útil pra broadphase e debug.
 *  - `col.offset = v` muta `shape.offset`; `col.offset` retorna `shape.offset ?? {0,0,0}`.
 */
export class ColliderComponent extends Component {
  /** Forma do collider — ver {@link ColliderShape}. Default: cubo 1×1×1. */
  shape: ColliderShape = { kind: 'box', size: { x: 1, y: 1, z: 1 } };

  // ── Aliases backwards-compat ────────────────────────────────────────────────

  /**
   * Dimensões totais do bounding box (largura × altura × profundidade).
   *
   * Getter deriva do `shape` atual; setter substitui `shape` por um box.
   * Mantido pra compatibilidade com código pré-ADR-0027.
   */
  get size(): Vec3 {
    const s = this.shape;
    switch (s.kind) {
      case 'box':      return s.size;
      case 'sphere':   return { x: s.radius * 2, y: s.radius * 2, z: s.radius * 2 };
      case 'cylinder': return { x: s.radius * 2, y: s.height,     z: s.radius * 2 };
      case 'capsule':  return { x: s.radius * 2, y: s.height + s.radius * 2, z: s.radius * 2 };
    }
  }
  set size(value: Vec3) {
    // Atribuir size implica "isto é um box" — substitui shape preservando offset.
    const prevOffset = this.shape.offset;
    this.shape = prevOffset !== undefined
      ? { kind: 'box', size: value, offset: prevOffset }
      : { kind: 'box', size: value };
  }

  /**
   * Deslocamento do centro do collider em relação a `RigidBodyComponent.position`.
   * Útil quando a geometria visual não está centrada na origem do corpo.
   */
  get offset(): Vec3 {
    return this.shape.offset ?? { x: 0, y: 0, z: 0 };
  }
  set offset(value: Vec3) {
    this.shape.offset = value;
  }
}

// ─── AABB helpers (internos) ───────────────────────────────────────────────────

/** Representação de um AABB como min/max nos três eixos. */
interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

/** Constrói o AABB de uma entidade a partir de seus componentes de física. */
function buildAABB(rb: RigidBodyComponent, col: ColliderComponent): AABB {
  const cx = rb.position.x + col.offset.x;
  const cy = rb.position.y + col.offset.y;
  const cz = rb.position.z + col.offset.z;
  const hx = col.size.x / 2;
  const hy = col.size.y / 2;
  const hz = col.size.z / 2;
  return {
    minX: cx - hx, maxX: cx + hx,
    minY: cy - hy, maxY: cy + hy,
    minZ: cz - hz, maxZ: cz + hz,
  };
}

/** Retorna `true` se dois AABBs se sobrepõem (colisão). */
function aabbOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.maxX > b.minX && a.minX < b.maxX &&
    a.maxY > b.minY && a.minY < b.maxY &&
    a.maxZ > b.minZ && a.minZ < b.maxZ
  );
}

// ─── PhysicsSystem ─────────────────────────────────────────────────────────────

/**
 * Sistema de física AABB sem dependências externas.
 *
 * Por tick (deltaTime em ms, convertido internamente para segundos):
 * 1. **Gravidade**: aplica `gravity` (unidades/s²) no eixo -Y de todos os
 *    corpos dinâmicos (`isStatic === false`).
 * 2. **Integração**: Euler explícito — `position += velocity × dt`.
 * 3. **Colisão**: detecta e resolve colisões AABB entre todos os pares de
 *    entidades elegíveis (O(n²)).
 *
 * Para cada colisão detectada:
 * - Calcula o eixo de mínima penetração (MTV — Minimum Translation Vector).
 * - Separa os corpos ao longo desse eixo.
 * - Cancela a componente de velocidade na direção da colisão.
 *
 * Requer que cada entidade possua **ambos** `RigidBodyComponent` e
 * `ColliderComponent`.
 *
 * @example
 * const world = new World();
 * world.addSystem(new PhysicsSystem());
 *
 * const ball = world.createEntity();
 * ball.addComponent(Object.assign(new RigidBodyComponent(), {
 *   position: { x: 0, y: 5, z: 0 },
 *   velocity: { x: 0, y: 0, z: 0 },
 * }));
 * ball.addComponent(new ColliderComponent()); // cubo 1×1×1
 *
 * const floor = world.createEntity();
 * floor.addComponent(Object.assign(new RigidBodyComponent(), {
 *   position: { x: 0, y: 0, z: 0 },
 *   isStatic: true,
 * }));
 * floor.addComponent(Object.assign(new ColliderComponent(), {
 *   size: { x: 10, y: 0.5, z: 10 },
 * }));
 *
 * world.tick(16.67); // ~60 FPS
 */
export class PhysicsSystem extends System {
  /**
   * Aceleração gravitacional em unidades/s² aplicada no eixo -Y.
   * Padrão: 9.8 (gravidade terrestre). Ajuste conforme as necessidades do jogo.
   */
  gravity: number = 9.8;

  /** @inheritdoc */
  static override requiredComponents = [RigidBodyComponent, ColliderComponent];

  /**
   * Executa gravidade, integração e resolução de colisões para o passo atual.
   *
   * @param entities   - Entidades com `RigidBodyComponent` + `ColliderComponent`.
   * @param deltaTime  - Tempo do passo em **ms** (convertido para s internamente).
   */
  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000; // ms → s

    // ── 1. Gravidade + integração de Euler ──────────────────────────────────
    for (const entity of entities) {
      const rb = entity.getComponent(RigidBodyComponent)!;
      if (!rb.enabled || rb.isStatic) continue;

      rb.velocity.y -= this.gravity * dt;

      rb.position.x += rb.velocity.x * dt;
      rb.position.y += rb.velocity.y * dt;
      rb.position.z += rb.velocity.z * dt;
    }

    // ── 2. Detecção e resolução de colisões AABB (O(n²)) ──────────────────
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        this._resolveCollision(entities[i], entities[j]);
      }
    }
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  /**
   * Detecta e resolve a colisão AABB entre duas entidades usando o MTV.
   *
   * Se ambos forem dinâmicos: a separação é dividida igualmente.
   * Se um for estático: apenas o dinâmico é movido.
   * Se ambos forem estáticos: nenhuma ação é tomada.
   */
  private _resolveCollision(entityA: Entity, entityB: Entity): void {
    const rbA = entityA.getComponent(RigidBodyComponent)!;
    const colA = entityA.getComponent(ColliderComponent)!;
    const rbB = entityB.getComponent(RigidBodyComponent)!;
    const colB = entityB.getComponent(ColliderComponent)!;

    // Par estático-estático: sem interação
    if (rbA.isStatic && rbB.isStatic) return;
    // Colliders desativados: sem interação
    if (!colA.enabled || !colB.enabled) return;

    const aabbA = buildAABB(rbA, colA);
    const aabbB = buildAABB(rbB, colB);

    if (!aabbOverlaps(aabbA, aabbB)) return;

    // ── Penetração em cada eixo ──────────────────────────────────────────────
    const overlapX = Math.min(aabbA.maxX, aabbB.maxX) - Math.max(aabbA.minX, aabbB.minX);
    const overlapY = Math.min(aabbA.maxY, aabbB.maxY) - Math.max(aabbA.minY, aabbB.minY);
    const overlapZ = Math.min(aabbA.maxZ, aabbB.maxZ) - Math.max(aabbA.minZ, aabbB.minZ);

    // ── Eixo de mínima penetração (MTV) ─────────────────────────────────────
    // nx/ny/nz: normal apontando de B para A (apenas um componente é não-zero)
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let minOverlap: number;

    if (overlapX <= overlapY && overlapX <= overlapZ) {
      nx = rbA.position.x < rbB.position.x ? -1 : 1;
      minOverlap = overlapX;
    } else if (overlapY <= overlapX && overlapY <= overlapZ) {
      ny = rbA.position.y < rbB.position.y ? -1 : 1;
      minOverlap = overlapY;
    } else {
      nz = rbA.position.z < rbB.position.z ? -1 : 1;
      minOverlap = overlapZ;
    }

    const bothDynamic = !rbA.isStatic && !rbB.isStatic;

    // ── Separação posicional ─────────────────────────────────────────────────
    if (bothDynamic) {
      const half = minOverlap / 2;
      rbA.position.x += nx * half;
      rbA.position.y += ny * half;
      rbA.position.z += nz * half;
      rbB.position.x -= nx * half;
      rbB.position.y -= ny * half;
      rbB.position.z -= nz * half;
    } else if (rbA.isStatic) {
      // A estático → empurra B para fora
      rbB.position.x -= nx * minOverlap;
      rbB.position.y -= ny * minOverlap;
      rbB.position.z -= nz * minOverlap;
    } else {
      // B estático → empurra A para fora
      rbA.position.x += nx * minOverlap;
      rbA.position.y += ny * minOverlap;
      rbA.position.z += nz * minOverlap;
    }

    // ── Cancelamento de velocidade na direção de colisão ────────────────────
    if (bothDynamic) {
      // Impulso elástico 1-D ponderado por massa ao longo do eixo de colisão.
      // Fórmula: vA' = vA - (2·mB / (mA+mB)) · (vA−vB)·n̂ · n̂
      //          vB' = vB + (2·mA / (mA+mB)) · (vA−vB)·n̂ · n̂
      const mA = rbA.mass > 0 ? rbA.mass : 1;
      const mB = rbB.mass > 0 ? rbB.mass : 1;
      const totalMass = mA + mB;
      // dot(vA - vB, n) — n tem apenas um componente não-zero (nx|ny|nz ∈ {-1,0,1})
      const relVn = (rbA.velocity.x - rbB.velocity.x) * nx
                  + (rbA.velocity.y - rbB.velocity.y) * ny
                  + (rbA.velocity.z - rbB.velocity.z) * nz;
      const impA = (2 * mB / totalMass) * relVn; // coef. de A
      const impB = (2 * mA / totalMass) * relVn; // coef. de B
      rbA.velocity.x -= impA * nx;
      rbA.velocity.y -= impA * ny;
      rbA.velocity.z -= impA * nz;
      rbB.velocity.x += impB * nx;
      rbB.velocity.y += impB * ny;
      rbB.velocity.z += impB * nz;
    } else if (rbA.isStatic) {
      // A estático → zeroa a componente de velocidade de B no eixo de colisão
      if (nx !== 0) rbB.velocity.x = 0;
      if (ny !== 0) rbB.velocity.y = 0;
      if (nz !== 0) rbB.velocity.z = 0;
    } else {
      // B estático → zeroa a componente de velocidade de A no eixo de colisão
      if (nx !== 0) rbA.velocity.x = 0;
      if (ny !== 0) rbA.velocity.y = 0;
      if (nz !== 0) rbA.velocity.z = 0;
    }
  }
}
