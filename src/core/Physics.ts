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

// ─── Tipos internos de colisão ─────────────────────────────────────────────────

/**
 * Resultado de uma função de detecção de colisão (narrow phase).
 *
 * `normal` aponta **de B para A** (direção pra separar A), unitário.
 * `penetration` é a profundidade da sobreposição em unidades world.
 *
 * Funções retornam `null` quando os shapes não se intersectam.
 */
interface CollisionResult {
  normal: Vec3;
  penetration: number;
}

/** Representação de um AABB como min/max nos três eixos. */
interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

/** Centro do shape no espaço world (rb.position + shape.offset). */
function shapeCenter(rb: RigidBodyComponent, col: ColliderComponent): Vec3 {
  const off = col.offset;
  return { x: rb.position.x + off.x, y: rb.position.y + off.y, z: rb.position.z + off.z };
}

/** AABB de um shape 'box' no espaço world. */
function boxAABB(center: Vec3, size: Vec3): AABB {
  const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
  return {
    minX: center.x - hx, maxX: center.x + hx,
    minY: center.y - hy, maxY: center.y + hy,
    minZ: center.z - hz, maxZ: center.z + hz,
  };
}

/** Retorna `true` se dois AABBs se sobrepõem. */
function aabbOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.maxX > b.minX && a.minX < b.maxX &&
    a.maxY > b.minY && a.minY < b.maxY &&
    a.maxZ > b.minZ && a.minZ < b.maxZ
  );
}

// ─── Algoritmos de colisão por par de shapes (narrow phase) ───────────────────

/**
 * Box ↔ Box (AABB) — algoritmo original do engine. Calcula sobreposição em
 * cada eixo, separa pelo eixo de mínima penetração (MTV) com normal
 * axis-aligned.
 */
function collideBoxBox(
  centerA: Vec3, sizeA: Vec3,
  centerB: Vec3, sizeB: Vec3,
): CollisionResult | null {
  const aabbA = boxAABB(centerA, sizeA);
  const aabbB = boxAABB(centerB, sizeB);
  if (!aabbOverlaps(aabbA, aabbB)) return null;

  const overlapX = Math.min(aabbA.maxX, aabbB.maxX) - Math.max(aabbA.minX, aabbB.minX);
  const overlapY = Math.min(aabbA.maxY, aabbB.maxY) - Math.max(aabbA.minY, aabbB.minY);
  const overlapZ = Math.min(aabbA.maxZ, aabbB.maxZ) - Math.max(aabbA.minZ, aabbB.minZ);

  // Normal aponta de B → A (componente único, axis-aligned).
  let nx = 0, ny = 0, nz = 0, penetration: number;
  if (overlapX <= overlapY && overlapX <= overlapZ) {
    nx = centerA.x < centerB.x ? -1 : 1;
    penetration = overlapX;
  } else if (overlapY <= overlapX && overlapY <= overlapZ) {
    ny = centerA.y < centerB.y ? -1 : 1;
    penetration = overlapY;
  } else {
    nz = centerA.z < centerB.z ? -1 : 1;
    penetration = overlapZ;
  }
  return { normal: { x: nx, y: ny, z: nz }, penetration };
}

/**
 * Sphere ↔ Sphere — comparação de distância. Se a distância entre centros
 * for menor que a soma dos raios, há colisão. Normal aponta de B → A
 * (centerA − centerB normalizado); penetração = (rA+rB) − distância.
 */
function collideSphereSphere(
  centerA: Vec3, rA: number,
  centerB: Vec3, rB: number,
): CollisionResult | null {
  const dx = centerA.x - centerB.x;
  const dy = centerA.y - centerB.y;
  const dz = centerA.z - centerB.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const rSum = rA + rB;
  if (distSq >= rSum * rSum) return null;

  const dist = Math.sqrt(distSq);
  // Caso degenerado: centros coincidem. Empurra arbitrariamente no +Y
  // pra evitar divisão por zero — qualquer direção serve, esse é um
  // estado raro de inicialização sobreposta.
  if (dist === 0) return { normal: { x: 0, y: 1, z: 0 }, penetration: rSum };

  const inv = 1 / dist;
  return {
    normal: { x: dx * inv, y: dy * inv, z: dz * inv },
    penetration: rSum - dist,
  };
}

/**
 * Box ↔ Sphere — encontra o ponto na caixa mais próximo do centro da
 * esfera (clamp do center da sphere ao AABB). Se a distância desse
 * ponto pro centro da esfera < raio, colisão. Normal aponta de
 * pointOnBox → centerSphere (= B → A se A=sphere); inverter no caller
 * se a tabela registra como (box, sphere) pra manter convenção.
 *
 * Aqui registramos como (box, sphere) na tabela e o normal sai de
 * sphere → box (B → A com A=box) — invertemos no fim.
 */
function collideBoxSphere(
  centerBox: Vec3, sizeBox: Vec3,
  centerSphere: Vec3, radius: number,
): CollisionResult | null {
  const hx = sizeBox.x / 2, hy = sizeBox.y / 2, hz = sizeBox.z / 2;
  // Closest point on box (clamp do centerSphere às faces do AABB).
  const cx = clamp(centerSphere.x, centerBox.x - hx, centerBox.x + hx);
  const cy = clamp(centerSphere.y, centerBox.y - hy, centerBox.y + hy);
  const cz = clamp(centerSphere.z, centerBox.z - hz, centerBox.z + hz);
  const dx = centerSphere.x - cx;
  const dy = centerSphere.y - cy;
  const dz = centerSphere.z - cz;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= radius * radius) return null;

  const dist = Math.sqrt(distSq);
  if (dist === 0) {
    // Centro da sphere está dentro da box — escolhe o eixo de mínima
    // penetração até a face mais próxima e empurra pra esse lado.
    const px = hx - Math.abs(centerSphere.x - centerBox.x);
    const py = hy - Math.abs(centerSphere.y - centerBox.y);
    const pz = hz - Math.abs(centerSphere.z - centerBox.z);
    if (px <= py && px <= pz) {
      const sign = centerSphere.x < centerBox.x ? -1 : 1;
      // Normal sai de box(A) → sphere(B); pra B→A invertemos no caller.
      return { normal: { x: sign, y: 0, z: 0 }, penetration: px + radius };
    }
    if (py <= pz) {
      const sign = centerSphere.y < centerBox.y ? -1 : 1;
      return { normal: { x: 0, y: sign, z: 0 }, penetration: py + radius };
    }
    const sign = centerSphere.z < centerBox.z ? -1 : 1;
    return { normal: { x: 0, y: 0, z: sign }, penetration: pz + radius };
  }

  // Normal aqui sai de pointOnBox → centerSphere (= A → B). Pra obedecer
  // convenção "normal de B → A", invertemos os sinais.
  const inv = 1 / dist;
  return {
    normal: { x: -dx * inv, y: -dy * inv, z: -dz * inv },
    penetration: radius - dist,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Tabela de despacho (kindA, kindB) → função de colisão.
 *
 * As funções recebem `(centerA, shapeA, centerB, shapeB)` e retornam o
 * CollisionResult com normal apontando de B para A. Pares assimétricos
 * (ex.: box ↔ sphere) só precisam ser declarados numa direção — o
 * resolver inverte o normal automaticamente quando consulta a entrada
 * espelhada via `dispatchPair`.
 *
 * Pares ainda não implementados retornam `null` (placeholder até as
 * próximas fases da ADR-0027). Como col.size é derivada do shape via
 * getter, todos os shapes funcionam como AABB até a colisão real
 * por shape ser plugada.
 */
type CollideFn = (
  centerA: Vec3, shapeA: ColliderShape,
  centerB: Vec3, shapeB: ColliderShape,
) => CollisionResult | null;

const collisionDispatch: Record<ColliderShape['kind'], Partial<Record<ColliderShape['kind'], CollideFn>>> = {
  box: {
    box: (cA, sA, cB, sB) => {
      if (sA.kind !== 'box' || sB.kind !== 'box') return null;
      return collideBoxBox(cA, sA.size, cB, sB.size);
    },
    sphere: (cA, sA, cB, sB) => {
      if (sA.kind !== 'box' || sB.kind !== 'sphere') return null;
      return collideBoxSphere(cA, sA.size, cB, sB.radius);
    },
  },
  sphere: {
    sphere: (cA, sA, cB, sB) => {
      if (sA.kind !== 'sphere' || sB.kind !== 'sphere') return null;
      return collideSphereSphere(cA, sA.radius, cB, sB.radius);
    },
  },
  cylinder: {},
  capsule:  {},
};

/** Negate normal — usado quando o dispatch foi feito com A/B trocados. */
function negateNormal(r: CollisionResult): CollisionResult {
  return { normal: { x: -r.normal.x, y: -r.normal.y, z: -r.normal.z }, penetration: r.penetration };
}

/**
 * Despacha pra função adequada na tabela. Se o par (a, b) não estiver
 * declarado, tenta (b, a) e inverte o normal. Fallback final:
 * **bounding box AABB** dos dois shapes — garante que o jogo nunca
 * trava esperando uma combinação que ainda não foi implementada.
 */
function dispatchPair(
  centerA: Vec3, shapeA: ColliderShape,
  centerB: Vec3, shapeB: ColliderShape,
): CollisionResult | null {
  const fn = collisionDispatch[shapeA.kind][shapeB.kind];
  if (fn) return fn(centerA, shapeA, centerB, shapeB);
  const swapped = collisionDispatch[shapeB.kind][shapeA.kind];
  if (swapped) {
    const r = swapped(centerB, shapeB, centerA, shapeA);
    return r === null ? null : negateNormal(r);
  }
  // Fallback: AABB do bounding box. Aproximação grosseira mas sempre
  // funciona — assim shapes novos (sphere/cylinder/capsule) já se
  // comportam como sólidos antes das colisões finas serem plugadas.
  return collideBoxBox(centerA, sizeOfShape(shapeA), centerB, sizeOfShape(shapeB));
}

/** Bounding box equivalente ao shape (mesma lógica do `col.size` getter). */
function sizeOfShape(s: ColliderShape): Vec3 {
  switch (s.kind) {
    case 'box':      return s.size;
    case 'sphere':   return { x: s.radius * 2, y: s.radius * 2, z: s.radius * 2 };
    case 'cylinder': return { x: s.radius * 2, y: s.height,     z: s.radius * 2 };
    case 'capsule':  return { x: s.radius * 2, y: s.height + s.radius * 2, z: s.radius * 2 };
  }
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

    const centerA = shapeCenter(rbA, colA);
    const centerB = shapeCenter(rbB, colB);

    // Narrow phase via tabela de despacho (kind × kind). Pares ainda não
    // implementados (sphere/cylinder/capsule) caem no fallback AABB.
    const collision = dispatchPair(centerA, colA.shape, centerB, colB.shape);
    if (collision === null) return;

    const { normal, penetration } = collision;
    const bothDynamic = !rbA.isStatic && !rbB.isStatic;

    // ── Separação posicional ─────────────────────────────────────────────────
    // Normal aponta de B → A; mover A no sentido positivo afasta os corpos.
    if (bothDynamic) {
      const half = penetration / 2;
      rbA.position.x += normal.x * half;
      rbA.position.y += normal.y * half;
      rbA.position.z += normal.z * half;
      rbB.position.x -= normal.x * half;
      rbB.position.y -= normal.y * half;
      rbB.position.z -= normal.z * half;
    } else if (rbA.isStatic) {
      rbB.position.x -= normal.x * penetration;
      rbB.position.y -= normal.y * penetration;
      rbB.position.z -= normal.z * penetration;
    } else {
      rbA.position.x += normal.x * penetration;
      rbA.position.y += normal.y * penetration;
      rbA.position.z += normal.z * penetration;
    }

    // ── Cancelamento de velocidade na direção de colisão ────────────────────
    // Funciona pra normal arbitrário (não-axis-aligned), o que abre caminho
    // pra sphere/cylinder/capsule terem normal em qualquer direção.
    if (bothDynamic) {
      // Impulso elástico 1-D ao longo do normal, ponderado por massa.
      //   vA' = vA - (2·mB / (mA+mB)) · ((vA − vB) · n̂) · n̂
      //   vB' = vB + (2·mA / (mA+mB)) · ((vA − vB) · n̂) · n̂
      const mA = rbA.mass > 0 ? rbA.mass : 1;
      const mB = rbB.mass > 0 ? rbB.mass : 1;
      const totalMass = mA + mB;
      const relVn = (rbA.velocity.x - rbB.velocity.x) * normal.x
                  + (rbA.velocity.y - rbB.velocity.y) * normal.y
                  + (rbA.velocity.z - rbB.velocity.z) * normal.z;
      const impA = (2 * mB / totalMass) * relVn;
      const impB = (2 * mA / totalMass) * relVn;
      rbA.velocity.x -= impA * normal.x;
      rbA.velocity.y -= impA * normal.y;
      rbA.velocity.z -= impA * normal.z;
      rbB.velocity.x += impB * normal.x;
      rbB.velocity.y += impB * normal.y;
      rbB.velocity.z += impB * normal.z;
    } else {
      // Um lado estático: zera a componente de velocidade do dinâmico na
      // direção do normal — `v_dyn -= (v_dyn · n̂) · n̂`.
      const rbDyn = rbA.isStatic ? rbB : rbA;
      const dot = rbDyn.velocity.x * normal.x
                + rbDyn.velocity.y * normal.y
                + rbDyn.velocity.z * normal.z;
      rbDyn.velocity.x -= dot * normal.x;
      rbDyn.velocity.y -= dot * normal.y;
      rbDyn.velocity.z -= dot * normal.z;
    }
  }
}
