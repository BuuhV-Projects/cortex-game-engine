// Tipos do Rapier (apagados na compilação) — pra anotar sem trazer o valor.
// É o default export (namespace), que serve como qualificador de tipo (RAPIER.World).
import type RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion, type Object3D, type Mesh } from 'three';

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
    obj.updateWorldMatrix(true, true);
    const v = new Vector3();
    obj.traverse((o) => {
      const mesh = o as Mesh;
      if (!(mesh as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.attributes['position'];
      if (!pos) return;
      const verts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        verts[i * 3] = v.x;
        verts[i * 3 + 1] = v.y;
        verts[i * 3 + 2] = v.z;
      }
      const idx = mesh.geometry.index;
      const indices = idx
        ? Uint32Array.from(idx.array)
        : Uint32Array.from({ length: pos.count }, (_, i) => i);
      this.addTrimesh(verts, indices);
    });
  }

  /**
   * Cria um **veículo raycast** (ADR-0081) — chassi (rigid body dinâmico + box) +
   * rodas por raycast com suspensão/esterço/motor/freio, via o
   * `DynamicRayCastVehicleController` do Rapier. As rodas raycastam o mundo Rapier
   * (terreno precisa ser collider), tudo no WASM (sem custo de CPU/JS). Ver {@link Vehicle}.
   */
  createVehicle(spec: VehicleSpec): Vehicle {
    const R = rapier();
    const he = spec.chassisHalfExtents;
    const desc = R.RigidBodyDesc.dynamic();
    if (spec.position) desc.setTranslation(spec.position.x, spec.position.y, spec.position.z);
    desc.setCanSleep(false); // veículo do player nunca "dorme"
    const chassis = this.world.createRigidBody(desc);
    const mass = spec.mass ?? 1200;
    const cd = R.ColliderDesc.cuboid(he.x, he.y, he.z).setFriction(spec.chassisFriction ?? 0.4);
    if (spec.chassisOffset) cd.setTranslation(spec.chassisOffset.x, spec.chassisOffset.y, spec.chassisOffset.z);
    if (spec.centerOfMass) {
      // CM EXPLÍCITO (anti-capotamento): collider sem massa + massa/CM/inércia setados à
      // mão, pra abaixar o centro de massa SEM mover a caixa (que precisa cobrir o corpo).
      // CM baixo = carro estável em curva rápida. Inércia ≈ caixa (m/3·(a²+b²)).
      cd.setDensity(0);
      this.world.createCollider(cd, chassis);
      const ix = (mass / 3) * (he.y * he.y + he.z * he.z);
      const iy = (mass / 3) * (he.x * he.x + he.z * he.z);
      const iz = (mass / 3) * (he.x * he.x + he.y * he.y);
      chassis.setAdditionalMassProperties(
        mass,
        { x: spec.centerOfMass.x, y: spec.centerOfMass.y, z: spec.centerOfMass.z },
        { x: ix, y: iy, z: iz },
        { x: 0, y: 0, z: 0, w: 1 },
        true,
      );
    } else {
      cd.setMass(mass);
      this.world.createCollider(cd, chassis);
    }

    const ctrl = this.world.createVehicleController(chassis);
    ctrl.indexUpAxis = 1; // Y é "pra cima" (a API é propriedade, não método)

    const restLen = spec.suspensionRestLength ?? 0.3;
    spec.wheels.forEach((w) => {
      ctrl.addWheel(
        { x: w.position.x, y: w.position.y, z: w.position.z },
        { x: 0, y: -1, z: 0 }, // suspensão aponta pra baixo
        { x: -1, y: 0, z: 0 }, // eixo da roda = X (→ frente = +Z)
        restLen,
        w.radius,
      );
    });
    for (let i = 0; i < spec.wheels.length; i++) {
      ctrl.setWheelSuspensionStiffness(i, spec.suspensionStiffness ?? 24);
      ctrl.setWheelSuspensionCompression(i, spec.suspensionCompression ?? 0.82);
      ctrl.setWheelSuspensionRelaxation(i, spec.suspensionRelaxation ?? 0.88);
      ctrl.setWheelMaxSuspensionTravel(i, spec.maxSuspensionTravel ?? 0.3);
      ctrl.setWheelFrictionSlip(i, spec.frictionSlip ?? 2.5); // grip arcade-real
    }
    return new Vehicle(ctrl, chassis, spec.wheels);
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

// Scratch reutilizável (sem alocar por frame) pro transform das rodas.
const _wv = new Vector3();
const _wq = new Quaternion();
const _wq2 = new Quaternion();
const _wax = new Vector3();

/**
 * **Veículo raycast** (ADR-0081) — wrapper do `DynamicRayCastVehicleController` do
 * Rapier. Aplica motor/freio/esterço, avança a simulação do veículo e expõe o
 * transform do chassi e de cada roda (pra sincronizar as malhas do `.glb`). As rodas
 * raycastam o mundo Rapier (terreno = collider) no WASM. Crie via
 * {@link RapierPhysics.createVehicle}; chame {@link Vehicle.update} APÓS `physics.step()`.
 */
export class Vehicle {
  constructor(
    private readonly ctrl: RAPIER.DynamicRayCastVehicleController,
    private readonly body: RAPIER.RigidBody,
    /** As rodas, na ordem em que foram adicionadas. */
    readonly wheels: VehicleWheelSpec[],
  ) {}

  /** Força do motor nas rodas com tração (N). 0 = desliga. */
  setEngineForce(force: number): void {
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i]!.powered) this.ctrl.setWheelEngineForce(i, force);
    }
  }
  /** Freio em todas as rodas. */
  setBrake(force: number): void {
    for (let i = 0; i < this.wheels.length; i++) this.ctrl.setWheelBrake(i, force);
  }
  /** Ângulo de esterço (rad) nas rodas que esterçam. */
  setSteering(angle: number): void {
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i]!.steering) this.ctrl.setWheelSteering(i, angle);
    }
  }
  /** Avança a física do veículo. Chame DEPOIS de `physics.step()`. */
  update(dt: number): void {
    this.ctrl.updateVehicle(dt);
  }

  /** Velocidade ao longo do forward (+Z local) do chassi, m/s (sinal = frente/ré). */
  forwardSpeed(): number {
    const v = this.body.linvel();
    const r = this.body.rotation();
    _wv.set(0, 0, 1).applyQuaternion(_wq.set(r.x, r.y, r.z, r.w));
    return v.x * _wv.x + v.y * _wv.y + v.z * _wv.z;
  }

  /** Velocidade LATERAL (eixo +X local) do chassi, m/s — alto = derrapando/drift. */
  lateralSpeed(): number {
    const v = this.body.linvel();
    const r = this.body.rotation();
    _wv.set(1, 0, 0).applyQuaternion(_wq.set(r.x, r.y, r.z, r.w));
    return v.x * _wv.x + v.y * _wv.y + v.z * _wv.z;
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
    const t = this.body.translation();
    const r = this.body.rotation();
    _wq.set(r.x, r.y, r.z, r.w); // rotação do chassi
    const cp = this.ctrl.wheelChassisConnectionPointCs(i) ?? { x: 0, y: 0, z: 0 };
    const len = this.ctrl.wheelSuspensionLength(i) ?? 0;
    outPos.set(cp.x, cp.y - len, cp.z).applyQuaternion(_wq); // conexão + suspensão (baixo)
    outPos.x += t.x;
    outPos.y += t.y;
    outPos.z += t.z;
    const steer = this.ctrl.wheelSteering(i) ?? 0;
    const spin = this.ctrl.wheelRotation(i) ?? 0;
    outQuat.copy(_wq).multiply(_wq2.setFromAxisAngle(_wax.set(0, 1, 0), steer)); // esterço (Y)
    outQuat.multiply(_wq2.setFromAxisAngle(_wax.set(1, 0, 0), spin)); // giro (eixo X)
  }

  /**
   * Transform LOCAL da roda `i` (relativo ao chassi) — pra sincronizar a malha da roda
   * quando ela é **filha** do carro (que já segue o chassi). Inclui suspensão (sobe/desce),
   * esterço (gira no Y) e rolagem (gira no eixo X).
   */
  wheelLocalTransform(i: number, outPos: Vector3, outQuat: Quaternion, spinAngle = 0): void {
    const cp = this.ctrl.wheelChassisConnectionPointCs(i) ?? { x: 0, y: 0, z: 0 };
    const len = this.ctrl.wheelSuspensionLength(i) ?? 0;
    outPos.set(cp.x, cp.y - len, cp.z);
    const steer = this.ctrl.wheelSteering(i) ?? 0;
    // `spinAngle` (rolagem) é fornecido pelo chamador — o wheelRotation do Rapier não é
    // confiável pra visual, então o sistema acumula o giro pela velocidade do carro.
    outQuat.setFromAxisAngle(_wax.set(0, 1, 0), steer); // esterço (Y)
    outQuat.multiply(_wq2.setFromAxisAngle(_wax.set(1, 0, 0), spinAngle)); // giro (eixo X)
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
    for (let i = 0; i < this.wheels.length; i++) {
      if (t.suspensionStiffness != null) this.ctrl.setWheelSuspensionStiffness(i, t.suspensionStiffness);
      if (t.suspensionRestLength != null) this.ctrl.setWheelSuspensionRestLength(i, t.suspensionRestLength);
      if (t.suspensionCompression != null) this.ctrl.setWheelSuspensionCompression(i, t.suspensionCompression);
      if (t.suspensionRelaxation != null) this.ctrl.setWheelSuspensionRelaxation(i, t.suspensionRelaxation);
      if (t.maxSuspensionTravel != null) this.ctrl.setWheelMaxSuspensionTravel(i, t.maxSuspensionTravel);
      if (t.frictionSlip != null) this.ctrl.setWheelFrictionSlip(i, t.frictionSlip);
    }
  }

  /**
   * **Anti-capotamento** (estabilizador de rolagem): corrige a INCLINAÇÃO lateral do
   * carro (rotação no eixo de avanço) de volta pra cima, sem mexer no esterço (yaw). Use
   * por frame ANTES do `physics.step()`. `strength` puxa pra cima; `damping` freia a
   * rolagem. Não impede capotar de propósito a baixa força — só evita tombar em
   * curva/relevo. Mexe na velocidade angular (independe da inércia → fácil de tunar).
   */
  keepUpright(strength: number, damping: number, dt: number): void {
    const r = this.body.rotation();
    _wq.set(r.x, r.y, r.z, r.w);
    const rightY = _wv.set(1, 0, 0).applyQuaternion(_wq).y; // 0 = de pé; ≠0 = inclinado
    _wax.set(0, 0, 1).applyQuaternion(_wq); // forward = eixo da rolagem
    const av = this.body.angvel();
    const rollRate = av.x * _wax.x + av.y * _wax.y + av.z * _wax.z;
    const delta = (-rightY * strength - rollRate * damping) * dt;
    this.body.setAngvel(
      { x: av.x + _wax.x * delta, y: av.y + _wax.y * delta, z: av.z + _wax.z * delta },
      true,
    );
  }

  /** Reseta o chassi (respawn): zera velocidades + (opcional) posiciona/orienta. */
  reset(position?: Vec3Like, rotation?: QuatLike): void {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (position) this.body.setTranslation(position, true);
    if (rotation) this.body.setRotation(rotation, true);
  }
}
