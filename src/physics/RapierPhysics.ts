// Tipos do Rapier (apagados na compilação) — pra anotar sem trazer o valor.
// É o default export (namespace), que serve como qualificador de tipo (RAPIER.World).
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vector3, Quaternion, Object3D } from 'three';
import { physicsSubsteps } from './physicsSubsteps.js';
import { RapierBody, colliderDescFor, forEachWorldTrimesh, loadRapier, rapier } from './rapierRuntime.js';
import {
  DEFAULT_SUSPENSION_REST_LENGTH,
  DEFAULT_SUSPENSION_STIFFNESS,
  applyBoxMassProperties,
  applyUprightCorrection,
  applyWheelTuning,
  axisSpeed,
  buildVehicleController,
  writeWheelLocalPose,
  writeWheelWorldPose,
} from './vehicleInternals.js';

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

/** Uma roda do {@link Vehicle} (posição relativa ao chassi + flags). */
export interface VehicleWheelSpec {
  /** Posição da roda relativa ao centro do chassi. */
  position: Vec3Like;
  /** Raio da roda (m). */
  radius: number;
  /** Esterça? (dianteiras = `true`). */
  steering?: boolean;
  /** Tem tração (motor)? */
  powered?: boolean;
  /** Multiplica o grip desta roda (ex.: traseira 0.7 = escapa mais → sobreesterço). Default 1. */
  gripScale?: number;
}

/** Config de {@link RapierPhysics.createVehicle} (ADR-0081). */
export interface VehicleSpec {
  position?: Vec3Like;
  /** Meia-extensão do chassi (box collider) — ex.: carro 4.85×1.4×2.27 → {2.42,0.7,1.13}. */
  chassisHalfExtents: Vec3Like;
  /**
   * Desloca a CAIXA do chassi em relação à origem do corpo (= origem do `.glb`).
   * **Importante:** se a origem do modelo fica embaixo (nas rodas), suba a caixa
   * (`{x:0,y:~0.6,z:0}`) pra ela ficar ACIMA das rodas — senão a caixa encosta no chão
   * antes das rodas e o carro **flutua**. Default `{0,0,0}`.
   */
  chassisOffset?: Vec3Like;
  /**
   * Centro de massa EXPLÍCITO (relativo à origem do corpo). **Baixo = anti-capotamento**
   * (carro estável em curva rápida); ex.: `{x:0,y:0,z:0}` (nível das rodas) ou negativo.
   * Quando definido, a massa vem daqui (o collider fica sem massa). Default: CM automático
   * do collider (no centro da caixa — alto, capota fácil).
   */
  centerOfMass?: Vec3Like;
  /**
   * Escala da inércia de GUINADA (curva). `< 1` = carro mais ágil/leve pra virar (arcade);
   * `1` = físico (pode dar entendimento — vira a roda mas o carro custa a rodar). Default 1.
   * Só com `centerOfMass` definido. Editável ao vivo via {@link Vehicle.setMassProperties}.
   */
  yawInertiaScale?: number;
  /** Massa do chassi (kg). Default 1200. */
  mass?: number;
  /** Atrito do chassi ao raspar. Default 0.4. */
  chassisFriction?: number;
  /** As rodas (tipicamente 4: FL/FR dianteiras steering, RL/RR traseiras powered). */
  wheels: VehicleWheelSpec[];
  suspensionRestLength?: number; // default 0.3
  suspensionStiffness?: number; // default 24
  suspensionCompression?: number; // default 0.82
  suspensionRelaxation?: number; // default 0.88
  maxSuspensionTravel?: number; // default 0.3
  /** Grip lateral/longitudinal. Maior = mais aderente (arcade). Default 2.5. */
  frictionSlip?: number;
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
/**
 * Carrega o Rapier (dynamic import do chunk `rapier.js`) e inicializa o WASM —
 * uma vez só, idempotente. Chamado por {@link RapierPhysics.create}.
 */
export function initRapier(): Promise<void> {
  return loadRapier();
}

/**
 * Maior passo de {@link RapierPhysics.advance} (s). Acima disso a suspensão
 * raycast perde estabilidade; é também o timestep padrão do Rapier, então a
 * 60 fps nada muda.
 */
export const MAX_PHYSICS_STEP_S = 1 / 60;
/**
 * Teto padrão de passos por quadro de {@link RapierPhysics.advance} (ADR-0672). Acima de 3 × 1/60 s (50 ms) o
 * excedente é descartado: a física desacelera em vez de gastar mais passos num quadro lento.
 */
export const MAX_PHYSICS_STEPS = 3;

export class RapierPhysics {
  /** Mundo do Rapier (uso avançado). */
  readonly world: RAPIER.World;
  /**
   * Máximo de passos por {@link RapierPhysics.advance} (ADR-0672; default {@link MAX_PHYSICS_STEPS}). Suba para a
   * física acompanhar o relógio em quadros lentos, ao custo de mais passos justo quando o quadro pesa.
   */
  maxStepsPerFrame: number = MAX_PHYSICS_STEPS;

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  /** Inicializa o Rapier (async) e cria o mundo com a gravidade dada. */
  static async create(gravity: Vec3Like = { x: 0, y: -9.81, z: 0 }): Promise<RapierPhysics> {
    await loadRapier();
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
    this.world.createCollider(colliderDescFor(spec), body);
    return new RapierBody(body);
  }

  /** Avança a simulação um passo (timestep fixo configurado no mundo). */
  step(): void {
    this.world.step();
  }

  /**
   * Avança a simulação `dt` segundos em passos IGUAIS de no máximo
   * {@link MAX_PHYSICS_STEP_S} (semi-fixed timestep — ADR-0257), com no máximo
   * {@link RapierPhysics.maxStepsPerFrame} passos (ADR-0672): acima disso o
   * excedente é descartado e a simulação anda menos que `dt`.
   *
   * Use no lugar de um `step()` por frame: aquele anda sempre 1/60 s, então a
   * velocidade da física passa a depender do fps (a 75 fps, 25% rápida demais).
   * Passo fixo sem interpolação também não serve: a 75 Hz, 1 frame em 5 fica
   * sem passo nenhum, e o objeto parado nele.
   *
   * @param dt tempo do frame (s). `0` ou negativo não avança.
   * @param beforeEachStep chamado antes de cada passo com o passo (s) — onde
   *   veículos fazem `update`/aderência.
   * @returns quantos passos foram dados.
   *
   * @example
   * physics.advance(dtSeconds, (step) => vehicle.update(step));
   */
  advance(dt: number, beforeEachStep?: (step: number) => void): number {
    const { steps, step } = physicsSubsteps(dt, MAX_PHYSICS_STEP_S, this.maxStepsPerFrame);
    if (steps === 0) return 0;
    // O mundo pode ser compartilhado com quem confia no timestep padrão.
    const previous = this.world.timestep;
    this.world.timestep = step;
    for (let i = 0; i < steps; i++) {
      beforeEachStep?.(step);
      this.step();
    }
    this.world.timestep = previous;
    return steps;
  }

  /** Adiciona um collider **trimesh estático** (fixo) — pro chão/terreno/road. */
  addTrimesh(vertices: Float32Array, indices: Uint32Array, position?: Vec3Like): void {
    const R = rapier();
    const desc = R.RigidBodyDesc.fixed();
    if (position) desc.setTranslation(position.x, position.y, position.z);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(R.ColliderDesc.trimesh(vertices, indices), body);
  }

  /**
   * Cria colliders trimesh estáticos a partir das MALHAS de um `Object3D` (geometria
   * em espaço-mundo) — ex.: terreno + road viram chão pras rodas do {@link Vehicle}
   * raycastarem. Uma malha = um collider.
   */
  addTrimeshFromObject(obj: Object3D): void {
    forEachWorldTrimesh(obj, (verts, indices) => this.addTrimesh(verts, indices));
  }

  /**
   * Cria um **veículo raycast** (ADR-0081) — chassi (rigid body dinâmico + box) +
   * rodas por raycast com suspensão/esterço/motor/freio, via o
   * `DynamicRayCastVehicleController` do Rapier. As rodas raycastam o mundo Rapier
   * (terreno precisa ser collider), tudo no WASM (sem custo de CPU/JS). Ver {@link Vehicle}.
   */
  createVehicle(spec: VehicleSpec): Vehicle {
    const { ctrl, chassis, restLength, stiffness } = buildVehicleController(rapier(), this.world, spec);
    const vehicle = new Vehicle(ctrl, chassis, spec.wheels, spec.chassisHalfExtents, { restLength, stiffness });
    if (spec.centerOfMass) vehicle.setMassProperties(spec.mass ?? 1200, spec.centerOfMass, spec.yawInertiaScale ?? 1);
    return vehicle;
  }

  /** Libera o mundo (memória WASM). */
  dispose(): void {
    this.world.free();
  }
}

/**
 * **Veículo raycast** (ADR-0081) — wrapper do `DynamicRayCastVehicleController` do
 * Rapier. Aplica motor/freio/esterço, avança a simulação do veículo e expõe o
 * transform do chassi e de cada roda (pra sincronizar as malhas do `.glb`). As rodas
 * raycastam o mundo Rapier (terreno = collider) no WASM. Crie via
 * {@link RapierPhysics.createVehicle}; chame {@link Vehicle.update} APÓS `physics.step()`.
 */
export class Vehicle {
  /**
   * Grupos de interação (`InteractionGroups` do Rapier) do raycast das rodas.
   * `undefined` = as rodas enxergam tudo.
   *
   * Grupos, e não um callback por collider, porque o host nativo ignora o
   * callback (SPEC-0209) — um filtro que só funciona no Studio é pior que
   * nenhum. Uso típico: carro em respawn vira fantasma (SPEC-0259).
   */
  wheelFilterGroups: number | undefined = undefined;

  private _suspensionRestLength: number;
  private _suspensionStiffness: number;
  private _engineForce = 0;

  constructor(
    private readonly ctrl: RAPIER.DynamicRayCastVehicleController,
    /**
     * Corpo rígido do chassi. Público para quem precisa agir sobre ele direto —
     * impulso, aderência ao chão ({@link GroundAdhesion}).
     */
    readonly body: RAPIER.RigidBody,
    /** As rodas, na ordem em que foram adicionadas. */
    readonly wheels: VehicleWheelSpec[],
    /** Meia-extensão do chassi (pra recalcular a inércia ao mudar massa/CM). */
    private readonly halfExtents: Vec3Like = { x: 1, y: 0.5, z: 2 },
    suspension = { restLength: DEFAULT_SUSPENSION_REST_LENGTH, stiffness: DEFAULT_SUSPENSION_STIFFNESS },
  ) {
    this._suspensionRestLength = suspension.restLength;
    this._suspensionStiffness = suspension.stiffness;
  }

  /**
   * Comprimento de repouso da suspensão (m), igual em todas as rodas.
   * Guardado aqui, e não lido do controller, porque o shim do host nativo não
   * implementa esse getter.
   */
  get suspensionRestLength(): number {
    return this._suspensionRestLength;
  }

  /** Rigidez da suspensão, igual em todas as rodas. Ver {@link suspensionRestLength}. */
  get suspensionStiffness(): number {
    return this._suspensionStiffness;
  }

  /**
   * Define massa + centro de massa AO VIVO (sem recriar o veículo) — ex.: editar no
   * Inspector. A inércia é recalculada como caixa (`m/3·(a²+b²)`). Requer o veículo criado
   * com `centerOfMass` (collider sem massa).
   */
  setMassProperties(mass: number, centerOfMass: Vec3Like, yawInertiaScale = 1): void {
    applyBoxMassProperties(this.body, this.halfExtents, mass, centerOfMass, yawInertiaScale);
  }

  /** Força do motor nas rodas com tração (N). 0 = desliga. Força ≠ 0 acorda o chassi (SPEC-0655). */
  setEngineForce(force: number): void {
    this._engineForce = force;
    if (force !== 0) this.wakeIfSleeping();
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i]!.powered) this.ctrl.setWheelEngineForce(i, force);
    }
  }
  /** A última força do motor pedida (N). */
  get engineForce(): number {
    return this._engineForce;
  }
  /** Freio em todas as rodas. */
  setBrake(force: number): void {
    for (let i = 0; i < this.wheels.length; i++) this.ctrl.setWheelBrake(i, force);
  }
  /** Ângulo de esterço (rad) nas rodas que esterçam. Ângulo ≠ 0 acorda o chassi (SPEC-0655). */
  setSteering(angle: number): void {
    if (angle !== 0) this.wakeIfSleeping();
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i]!.steering) this.ctrl.setWheelSteering(i, angle);
    }
  }
  /** Velocidade linear² do chassi (m²/s²) — a regra de repouso da SPEC-0655. */
  linvelSquared(): number {
    const v = this.body.linvel();
    return v.x * v.x + v.y * v.y + v.z * v.z;
  }
  /** Velocidade angular² do chassi (rad²/s²). */
  angvelSquared(): number {
    const w = this.body.angvel();
    return w.x * w.x + w.y * w.y + w.z * w.z;
  }
  private wakeIfSleeping(): void {
    if (this.body.isSleeping()) this.body.wakeUp();
  }
  /** Avança a física do veículo. Chame DEPOIS de `physics.step()`. */
  update(dt: number): void {
    this.ctrl.updateVehicle(dt, undefined, this.wheelFilterGroups);
  }

  /** Velocidade ao longo do forward (+Z local) do chassi, m/s (sinal = frente/ré). */
  forwardSpeed(): number {
    return axisSpeed(this.body, 0, 0, 1);
  }

  /** Velocidade LATERAL (eixo +X local) do chassi, m/s — alto = derrapando/drift. */
  lateralSpeed(): number {
    return axisSpeed(this.body, 1, 0, 0);
  }

  /** A roda `i` está tocando o chão? */
  wheelIsInContact(i: number): boolean {
    return this.ctrl.wheelIsInContact(i);
  }

  /** Escreve em `out` o ponto de contato MUNDIAL da roda `i`; `false` se não há contato. */
  wheelContactPoint(i: number, out: Vector3): boolean {
    const p = this.ctrl.wheelContactPoint(i);
    if (!p) return false;
    out.set(p.x, p.y, p.z);
    return true;
  }

  /** Número de rodas. */
  get wheelCount(): number {
    return this.wheels.length;
  }

  chassisTranslation(): Vec3Like {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }
  chassisRotation(): QuatLike {
    const r = this.body.rotation();
    return { x: r.x, y: r.y, z: r.z, w: r.w };
  }

  /** Escreve em `outPos`/`outQuat` o transform MUNDIAL da roda `i` (pra a malha). */
  wheelTransform(i: number, outPos: Vector3, outQuat: Quaternion): void {
    writeWheelWorldPose(this.ctrl, this.body, i, outPos, outQuat);
  }

  /**
   * Transform LOCAL da roda `i` (relativo ao chassi) — pra sincronizar a malha da roda
   * quando ela é **filha** do carro (que já segue o chassi). Inclui suspensão (sobe/desce),
   * esterço (gira no Y) e rolagem (gira no eixo X).
   *
   * `spinAngle` (rolagem) é fornecido pelo chamador — o wheelRotation do Rapier não é
   * confiável pra visual, então o sistema acumula o giro pela velocidade do carro.
   */
  wheelLocalTransform(i: number, outPos: Vector3, outQuat: Quaternion, spinAngle = 0): void {
    writeWheelLocalPose(this.ctrl, i, outPos, outQuat, spinAngle);
  }

  /**
   * Aplica AO VIVO parâmetros de suspensão/grip em TODAS as rodas (ex.: editar no
   * Inspector sem reiniciar). Só mexe nos campos informados. (Massa e centro de massa
   * NÃO mudam aqui — precisam recriar o veículo.)
   */
  applyTuning(t: {
    suspensionStiffness?: number;
    suspensionRestLength?: number;
    suspensionCompression?: number;
    suspensionRelaxation?: number;
    maxSuspensionTravel?: number;
    frictionSlip?: number;
  }): void {
    if (t.suspensionStiffness != null) this._suspensionStiffness = t.suspensionStiffness;
    if (t.suspensionRestLength != null) this._suspensionRestLength = t.suspensionRestLength;
    applyWheelTuning(this.ctrl, this.wheels.map((w) => w.gripScale), t);
  }

  /**
   * **Anti-capotamento** (estabilizador de rolagem): corrige a INCLINAÇÃO lateral do
   * carro (rotação no eixo de avanço) de volta pra cima, sem mexer no esterço (yaw). Use
   * por frame ANTES do `physics.step()`. `strength` puxa pra cima; `damping` freia a
   * rolagem. Não impede capotar de propósito a baixa força — só evita tombar em
   * curva/relevo. Mexe na velocidade angular (independe da inércia → fácil de tunar).
   */
  keepUpright(strength: number, damping: number, dt: number): void {
    applyUprightCorrection(this.body, strength, damping, dt);
  }

  /** Reseta o chassi (respawn): zera velocidades + (opcional) posiciona/orienta. */
  reset(position?: Vec3Like, rotation?: QuatLike): void {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (position) this.body.setTranslation(position, true);
    if (rotation) this.body.setRotation(rotation, true);
  }
}
