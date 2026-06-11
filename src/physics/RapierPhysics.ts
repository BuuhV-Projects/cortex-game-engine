import RAPIER from '@dimforge/rapier3d-compat';

/**
 * **Integração com o Rapier** (motor de física dinâmica em WASM; TDR-0002). Wrapper
 * fino e **headless** (não conhece three.js): cria o mundo, adiciona corpos/colliders
 * e dá passos. A sincronia com o `Object3D` (ECS) fica no `RapierPhysicsSystem`.
 *
 * O Rapier precisa de **init assíncrono** (carrega o WASM uma vez) — por isso
 * {@link RapierPhysics.create} é `async`. Não vaza tipos do Rapier na API pública
 * (devolve {@link PhysicsBody}), pra o `.d.ts`/vendoring ficarem limpos.
 *
 * @example
 * const physics = await RapierPhysics.create({ x: 0, y: -9.81, z: 0 })
 * physics.addBody({ type: 'fixed', shape: { kind: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } } })
 * const box = physics.addBody({ type: 'dynamic', position: { x: 0, y: 10, z: 0 },
 *   shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } })
 * physics.step()
 * box.translation() // { x, y, z } — copie pro mesh
 */

/** Vetor 3 simples (sem depender de three nem do Rapier). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}
/** Quaternion simples. */
export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Forma de colisão do corpo. */
export type PhysicsShape =
  | { kind: 'box'; halfExtents: Vec3Like }
  | { kind: 'ball'; radius: number }
  | { kind: 'capsule'; halfHeight: number; radius: number };

/** Spec declarativa de um corpo (vira RigidBody + Collider no Rapier). */
export interface BodySpec {
  /** `dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move. */
  type: 'dynamic' | 'fixed' | 'kinematic';
  /** Posição inicial. Default origem. */
  position?: Vec3Like;
  /** Forma do collider. */
  shape: PhysicsShape;
  /** Quão "quicante" (0 = não quica). */
  restitution?: number;
  /** Atrito. */
  friction?: number;
  /** `true` = trigger (detecta sobreposição mas NÃO bloqueia). */
  isSensor?: boolean;
}

/** Handle de um corpo físico (não vaza o tipo do Rapier). */
export interface PhysicsBody {
  /** Posição atual (centro do corpo). */
  translation(): Vec3Like;
  /** Rotação atual (quaternion). */
  rotation(): QuatLike;
  /** Move um corpo `kinematic` (aplicado no próximo `step`). */
  setNextKinematicTranslation(p: Vec3Like): void;
}

let initPromise: Promise<void> | null = null;
/** Inicializa o Rapier (carrega o WASM) — uma vez só, idempotente. */
export function initRapier(): Promise<void> {
  return (initPromise ??= RAPIER.init());
}

class RapierBody implements PhysicsBody {
  constructor(private readonly body: RAPIER.RigidBody) {}
  translation(): Vec3Like {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }
  rotation(): QuatLike {
    const r = this.body.rotation();
    return { x: r.x, y: r.y, z: r.z, w: r.w };
  }
  setNextKinematicTranslation(p: Vec3Like): void {
    this.body.setNextKinematicTranslation(p);
  }
}

export class RapierPhysics {
  /** Mundo do Rapier (uso avançado). */
  readonly world: RAPIER.World;

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  /** Inicializa o Rapier (async) e cria o mundo com a gravidade dada. */
  static async create(gravity: Vec3Like = { x: 0, y: -9.81, z: 0 }): Promise<RapierPhysics> {
    await initRapier();
    return new RapierPhysics(new RAPIER.World(gravity));
  }

  /** Adiciona um corpo (RigidBody + Collider) e devolve seu handle. */
  addBody(spec: BodySpec): PhysicsBody {
    const desc =
      spec.type === 'dynamic'
        ? RAPIER.RigidBodyDesc.dynamic()
        : spec.type === 'kinematic'
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.fixed();
    if (spec.position) desc.setTranslation(spec.position.x, spec.position.y, spec.position.z);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(this.colliderDesc(spec), body);
    return new RapierBody(body);
  }

  /** Avança a simulação um passo (timestep fixo configurado no mundo). */
  step(): void {
    this.world.step();
  }

  /** Libera o mundo (memória WASM). */
  dispose(): void {
    this.world.free();
  }

  private colliderDesc(spec: BodySpec): RAPIER.ColliderDesc {
    const s = spec.shape;
    let c: RAPIER.ColliderDesc;
    if (s.kind === 'box') c = RAPIER.ColliderDesc.cuboid(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z);
    else if (s.kind === 'ball') c = RAPIER.ColliderDesc.ball(s.radius);
    else c = RAPIER.ColliderDesc.capsule(s.halfHeight, s.radius);
    if (spec.restitution != null) c.setRestitution(spec.restitution);
    if (spec.friction != null) c.setFriction(spec.friction);
    if (spec.isSensor) c.setSensor(true);
    return c;
  }
}
