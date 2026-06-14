// Tipos do Rapier (apagados na compilação) — pra anotar sem trazer o valor.
// É o default export (namespace), que serve como qualificador de tipo (RAPIER.World).
import type RAPIER from '@dimforge/rapier3d-compat';

/** Tipo do namespace-valor do Rapier (o default export), carregado sob demanda. */
type RapierApi = (typeof import('@dimforge/rapier3d-compat'))['default'];

/**
 * **Integração com o Rapier** (motor de física dinâmica em WASM; TDR-0002). Wrapper
 * fino e **headless** (não conhece three.js): cria o mundo, adiciona corpos/colliders
 * e dá passos. A sincronia com o `Object3D` (ECS) fica no `RapierPhysicsSystem`.
 *
 * O Rapier é **carregado sob demanda** (dynamic import → chunk `rapier.js` separado,
 * fora do bundle base) e precisa de **init assíncrono** (carrega o WASM uma vez) —
 * por isso {@link RapierPhysics.create} é `async`. Não vaza tipos do Rapier na API
 * pública (devolve {@link PhysicsBody}), pra o `.d.ts`/vendoring ficarem limpos.
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

/**
 * Handle de um corpo físico (não vaza o tipo do Rapier). Além de ler a pose
 * ({@link PhysicsBody.translation}/{@link PhysicsBody.rotation}), expõe as operações
 * comuns de corpo **dinâmico** pra gameplay (chutar uma bola, dar um pulo, resetar a
 * posição) sem precisar furar pro `RigidBody` interno. Pegue o handle via
 * `entity.getComponent(RapierBodyComponent)!.body` (existe depois do 1º tick).
 *
 * @example
 * // chutar a bola na direção `dir` (Vec3) com força `power`:
 * const ball = entity.getComponent(RapierBodyComponent)!.body
 * ball?.applyImpulse({ x: dir.x * power, y: 0, z: dir.z * power })
 * // resetar a bola pro centro do campo (zera velocidade + teleporta):
 * ball?.reset({ x: 0, y: 0.5, z: 0 })
 */
export interface PhysicsBody {
  /** Posição atual (centro do corpo). */
  translation(): Vec3Like;
  /** Rotação atual (quaternion). */
  rotation(): QuatLike;
  /** Velocidade linear atual (unidades/s). */
  linvel(): Vec3Like;
  /** Velocidade angular atual (rad/s). */
  angvel(): Vec3Like;
  /** Move um corpo `kinematic` (aplicado no próximo `step`). */
  setNextKinematicTranslation(p: Vec3Like): void;
  /**
   * Aplica um **impulso** (mudança instantânea de momento) no centro do corpo —
   * o jeito típico de "chutar"/"empurrar" um corpo dinâmico. Acorda o corpo.
   */
  applyImpulse(impulse: Vec3Like, wakeUp?: boolean): void;
  /** Aplica um **impulso de torque** (gira o corpo). Acorda o corpo. */
  applyTorqueImpulse(torque: Vec3Like, wakeUp?: boolean): void;
  /** Define a **velocidade linear** diretamente (sobrescreve a atual). Acorda o corpo. */
  setLinvel(velocity: Vec3Like, wakeUp?: boolean): void;
  /** Define a **velocidade angular** diretamente. Acorda o corpo. */
  setAngvel(velocity: Vec3Like, wakeUp?: boolean): void;
  /** **Teleporta** o corpo (pose). Pra dinâmico, considere {@link PhysicsBody.reset}. */
  setTranslation(p: Vec3Like, wakeUp?: boolean): void;
  /** Define a rotação (quaternion) diretamente. */
  setRotation(q: QuatLike, wakeUp?: boolean): void;
  /** Acorda o corpo (corpos parados "dormem" e ignoram forças até serem acordados). */
  wakeUp(): void;
  /**
   * **Reseta** o corpo: zera as velocidades (linear+angular) e, se passar `position`/
   * `rotation`, teleporta pra lá. Ideal pra "recolocar a bola no centro" sem o corpo
   * sair voando com a velocidade que tinha.
   */
  reset(position?: Vec3Like, rotation?: QuatLike): void;
}

let api: RapierApi | null = null;
let initPromise: Promise<void> | null = null;
/**
 * Carrega o Rapier (dynamic import do chunk `rapier.js`) e inicializa o WASM —
 * uma vez só, idempotente. Chamado por {@link RapierPhysics.create}.
 */
export function initRapier(): Promise<void> {
  return (initPromise ??= (async () => {
    const mod = await import('@dimforge/rapier3d-compat');
    api = mod.default;
    await api.init();
  })());
}
/** O namespace do Rapier já inicializado (erro se chamado antes do init). */
function rapier(): RapierApi {
  if (!api) throw new Error('Rapier não inicializado — use RapierPhysics.create() (await).');
  return api;
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
  linvel(): Vec3Like {
    const v = this.body.linvel();
    return { x: v.x, y: v.y, z: v.z };
  }
  angvel(): Vec3Like {
    const v = this.body.angvel();
    return { x: v.x, y: v.y, z: v.z };
  }
  setNextKinematicTranslation(p: Vec3Like): void {
    this.body.setNextKinematicTranslation(p);
  }
  applyImpulse(impulse: Vec3Like, wakeUp = true): void {
    this.body.applyImpulse(impulse, wakeUp);
  }
  applyTorqueImpulse(torque: Vec3Like, wakeUp = true): void {
    this.body.applyTorqueImpulse(torque, wakeUp);
  }
  setLinvel(velocity: Vec3Like, wakeUp = true): void {
    this.body.setLinvel(velocity, wakeUp);
  }
  setAngvel(velocity: Vec3Like, wakeUp = true): void {
    this.body.setAngvel(velocity, wakeUp);
  }
  setTranslation(p: Vec3Like, wakeUp = true): void {
    this.body.setTranslation(p, wakeUp);
  }
  setRotation(q: QuatLike, wakeUp = true): void {
    this.body.setRotation(q, wakeUp);
  }
  wakeUp(): void {
    this.body.wakeUp();
  }
  reset(position?: Vec3Like, rotation?: QuatLike): void {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (position) this.body.setTranslation(position, true);
    if (rotation) this.body.setRotation(rotation, true);
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
    return new RapierPhysics(new (rapier().World)(gravity));
  }

  /** Adiciona um corpo (RigidBody + Collider) e devolve seu handle. */
  addBody(spec: BodySpec): PhysicsBody {
    const R = rapier();
    const desc =
      spec.type === 'dynamic'
        ? R.RigidBodyDesc.dynamic()
        : spec.type === 'kinematic'
          ? R.RigidBodyDesc.kinematicPositionBased()
          : R.RigidBodyDesc.fixed();
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
    const R = rapier();
    const s = spec.shape;
    let c: RAPIER.ColliderDesc;
    if (s.kind === 'box') c = R.ColliderDesc.cuboid(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z);
    else if (s.kind === 'ball') c = R.ColliderDesc.ball(s.radius);
    else c = R.ColliderDesc.capsule(s.halfHeight, s.radius);
    if (spec.restitution != null) c.setRestitution(spec.restitution);
    if (spec.friction != null) c.setFriction(spec.friction);
    if (spec.isSensor) c.setSensor(true);
    return c;
  }
}
