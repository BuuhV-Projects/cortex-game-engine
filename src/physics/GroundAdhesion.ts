/**
 * Aderência arcade ao chão (ADR-0256 / SPEC-0259).
 *
 * Porta do `followGround` do kart-racer. Restringe SÓ altura, pitch e roll do
 * chassi ao chão sob as rodas; o Rapier continua dono de esterço, tração,
 * suspensão, freio e colisão horizontal com paredes.
 *
 * Existe porque o veículo da engine é de simulação: num kart ele capota na
 * rampa, perde contato no meio-fio e desacelera na subida. O único jogo de
 * carro que existiu no motor desligou pitch, roll e o anti-capotamento para
 * escrever isto por fora.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { RapierPhysics, Vehicle } from './RapierPhysics.js';

/**
 * Bits do `QueryFilterFlags` do Rapier. Números, e não o enum do módulo, porque
 * o shim do host nativo espelha os valores mas não exporta o enum.
 */
const EXCLUDE_KINEMATIC = 2;
const EXCLUDE_DYNAMIC = 4;
const EXCLUDE_SENSORS = 8;
/**
 * Chão é só corpo fixo e não-sensor. Filtrar por flag resolve dentro do Rapier,
 * na travessia da BVH — sem callback JS por acerto (SPEC-0006 do kart-racer).
 */
const GROUND_QUERY_FILTER = EXCLUDE_KINEMATIC | EXCLUDE_DYNAMIC | EXCLUDE_SENSORS;

/** Assentamento máximo da suspensão, como fração do comprimento de repouso. */
const MAX_SAG_FRACTION = 0.5;
/**
 * Normal mínima de um acerto individual. Rejeita a face LATERAL de uma faixa
 * pintada ou meio-fio: sem isto um raio que pega a quina solta o carro por um
 * frame. A inclinação dirigível de verdade é decidida pelo plano inteiro
 * (`minNormalY`), não por um raio.
 */
const MIN_HIT_NORMAL_Y = 0.01;
/** Apoios mínimos para definir um plano. */
const MIN_SUPPORTS = 3;

export interface GroundAdhesionOptions {
  /** Quanto o chão pode "puxar" o carro por passo (m). Maior salto = solta. Default 0,65. */
  snapDistance?: number;
  /** Quanto acima da base do pneu o raio nasce (m). Default 0,45. */
  probeRise?: number;
  /** `y` mínimo da normal do plano de apoio — inclinação máxima dirigível. Default 0,55 (~57°). */
  minNormalY?: number;
  /** Alcance do raio abaixo da base quando o carro já está no ar (m). Default 0,12. */
  airborneProbe?: number;
}

const DEFAULTS: Required<GroundAdhesionOptions> = {
  snapDistance: 0.65,
  probeRise: 0.45,
  minNormalY: 0.55,
  airborneProbe: 0.12,
};

interface RayHit {
  normal: { y: number };
  timeOfImpact?: number;
  toi?: number;
}

/**
 * Mantém um {@link Vehicle} colado no chão, com feel arcade.
 *
 * Chame {@link GroundAdhesion.apply} a cada passo de física, ANTES do
 * `vehicle.update` — o `VehicleArcadeSystem` já faz isso.
 *
 * @example
 * const adhesion = new GroundAdhesion(physics, vehicle, { minNormalY: 0.6 });
 * adhesion.apply(1 / 60);
 * if (!adhesion.grounded) playAirborneAnimation();
 */
export class GroundAdhesion {
  /** O carro terminou o último passo apoiado no chão? */
  grounded = false;
  /** Normal do plano de apoio no último passo apoiado. */
  readonly groundNormal = new Vector3(0, 1, 0);

  private readonly opts: Required<GroundAdhesionOptions>;
  // Raio duck-typed: o Rapier só lê `origin` e `dir`. Compartilhar os vetores
  // evita alocar um `Ray` por consulta (e funciona no WASM e no shim do host).
  private readonly origin = new Vector3();
  private readonly ray = { origin: this.origin, dir: new Vector3(0, -1, 0) };
  private readonly points: Vector3[];
  private readonly hits: boolean[];
  private readonly supports: Vector3[] = [];
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly delta = new Quaternion();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly normal = new Vector3();
  private readonly offset = new Vector3();
  private readonly velocity = new Vector3();
  private readonly basis = new Matrix4();

  constructor(
    private readonly physics: RapierPhysics,
    private readonly vehicle: Vehicle,
    options: GroundAdhesionOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    this.points = vehicle.wheels.map(() => new Vector3());
    this.hits = vehicle.wheels.map(() => false);
  }

  /**
   * Um passo de aderência. Devolve {@link GroundAdhesion.grounded}.
   *
   * @param dt passo de física (s) — usado para cancelar a gravidade ao longo
   *   da pista. `0` só reposiciona, sem mexer na velocidade por gravidade.
   */
  apply(dt: number): boolean {
    const { vehicle, opts } = this;
    const body = vehicle.body;
    const gravity = this.physics.world.gravity;
    const gravityMagnitude = Math.hypot(gravity.x, gravity.y, gravity.z);
    const rest = vehicle.suspensionRestLength;
    const sag = Math.min(
      rest * MAX_SAG_FRACTION,
      gravityMagnitude / (vehicle.wheelCount * vehicle.suspensionStiffness),
    );
    const t = body.translation();
    const r = body.rotation();
    const position = this.position.set(t.x, t.y, t.z);
    const rotation = this.rotation.set(r.x, r.y, r.z, r.w);

    // Raio do centro: nasce na altura da base dos pneus, para não grudar num
    // viaduto ACIMA. Exigir apoio central solta o carro na borda de um penhasco.
    // A altura vem das rodas, não da origem do corpo: no kart-racer a origem do
    // .glb ficava na base do pneu e o original lançava dali — num modelo com a
    // origem no centro do chassi o raio nunca alcançava o chão.
    let baseY = 0;
    for (const wheel of vehicle.wheels) baseY += wheel.position.y - (rest - sag + wheel.radius);
    baseY /= vehicle.wheelCount;
    const center = this.offset.set(0, baseY, 0).applyQuaternion(rotation).add(position);
    if (this.cast(center) === null) return this.release();

    let count = 0;
    for (let i = 0; i < vehicle.wheelCount; i++) {
      const wheel = vehicle.wheels[i]!;
      const point = this.points[i]!.set(wheel.position.x, wheel.position.y, wheel.position.z);
      point.y -= rest - sag + wheel.radius;
      point.applyQuaternion(rotation).add(position);
      const distance = this.cast(point);
      this.hits[i] = distance !== null;
      if (distance === null) continue;
      point.copy(this.origin).addScaledVector(this.ray.dir, distance);
      count++;
    }
    if (count < MIN_SUPPORTS) return this.release();

    const normal = this.normal;
    if (count === vehicle.wheelCount) {
      // Plano pelo apoio inteiro. Com 4 rodas é o `fl+fr-rl-rr` do kart-racer,
      // mas pelo SINAL da posição local: não depende da ordem nem da contagem.
      this.forward.set(0, 0, 0);
      this.right.set(0, 0, 0);
      for (let i = 0; i < vehicle.wheelCount; i++) {
        const local = vehicle.wheels[i]!.position;
        this.forward.addScaledVector(this.points[i]!, Math.sign(local.z));
        this.right.addScaledVector(this.points[i]!, Math.sign(local.x));
      }
      normal.crossVectors(this.forward, this.right).normalize();
    } else {
      // Apoio parcial: 3 pontos ainda definem um plano. Média de normais faria
      // o chassi pular quando um raio cruza o meio-fio.
      const s = this.firstSupports();
      this.forward.subVectors(s[1]!, s[0]!);
      this.right.subVectors(s[2]!, s[0]!);
      normal.crossVectors(this.forward, this.right).normalize();
      if (normal.y < 0) normal.negate();
    }
    if (!(normal.y >= opts.minNormalY)) return this.release();

    // Alinha o chassi ao plano, mantendo a direção de avanço projetada nele.
    const forward = this.forward.set(0, 0, 1).applyQuaternion(rotation);
    forward.y = -(forward.x * normal.x + forward.z * normal.z) / normal.y;
    forward.normalize();
    const right = this.right.crossVectors(normal, forward).normalize();
    this.delta.copy(rotation).invert();
    rotation.setFromRotationMatrix(this.basis.makeBasis(right, normal, forward));
    this.delta.premultiply(rotation);

    let height = 0;
    for (let i = 0; i < vehicle.wheelCount; i++) {
      if (!this.hits[i]) continue;
      const wheel = vehicle.wheels[i]!;
      const offset = this.offset.set(wheel.position.x, wheel.position.y, wheel.position.z);
      offset.y -= rest - sag + wheel.radius;
      offset.applyQuaternion(rotation);
      height += this.points[i]!.y - offset.y;
    }
    height /= count;
    if (Math.abs(height - position.y) > opts.snapDistance) return this.release();

    // Redireciona o movimento para a nova inclinação SEM devolver velocidade
    // perdida em batida.
    const v = body.linvel();
    const velocity = this.velocity.set(v.x, v.y, v.z).applyQuaternion(this.delta);
    velocity.addScaledVector(normal, -velocity.dot(normal));
    // Arcade: subida e descida respondem igual ao acelerador. Cancela só a
    // gravidade AO LONGO da pista, uma vez antes do passo de física.
    this.offset.set(gravity.x, gravity.y, gravity.z).multiplyScalar(-dt);
    this.offset.addScaledVector(normal, -this.offset.dot(normal));
    velocity.add(this.offset);

    position.y = height;
    body.setRotation(rotation, true);
    body.setTranslation(position, true);
    body.setLinvel(velocity, true);
    this.grounded = true;
    this.groundNormal.copy(normal);
    return true;
  }

  /** Lança o raio para baixo a partir de `point`; devolve a distância desde a origem, ou `null`. */
  private cast(point: Vector3): number | null {
    const { opts } = this;
    this.origin.copy(point).y += opts.probeRise;
    const reach = opts.probeRise + (this.grounded ? opts.snapDistance : opts.airborneProbe);
    const hit = this.physics.world.castRayAndGetNormal(
      this.ray as never,
      reach,
      false,
      GROUND_QUERY_FILTER,
      undefined,
      undefined,
      this.vehicle.body,
    ) as RayHit | null;
    if (hit === null || !(hit.normal.y > MIN_HIT_NORMAL_Y)) return null;
    // O runtime vendorizado usa `timeOfImpact`; tipagens antigas, `toi`.
    const distance = hit.timeOfImpact ?? hit.toi;
    return distance !== undefined && Number.isFinite(distance) ? distance : null;
  }

  /** Os três primeiros apoios. Só chamado com pelo menos 3. */
  private firstSupports(): Vector3[] {
    const found = this.supports;
    found.length = 0;
    for (let i = 0; i < this.hits.length && found.length < MIN_SUPPORTS; i++) {
      if (this.hits[i]) found.push(this.points[i]!);
    }
    return found;
  }

  private release(): false {
    this.grounded = false;
    return false;
  }
}
