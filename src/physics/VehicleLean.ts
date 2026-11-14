/**
 * Inclinação VISUAL de veículo na curva — motos, scooters, ATVs (ADR-0734 / SPEC-0735).
 *
 * O alvo vem da guinada do próprio corpo: `−atan(v·ω_up/g)`, a inclinação de
 * equilíbrio de uma moto. Assim serve igual ao jogador e à IA da frota, que
 * escreve o esterço direto no `Vehicle`. Só gira um nó FILHO da malha do
 * chassi; o corpo do Rapier (e com ele o `GroundAdhesion` e o `keepUpright`)
 * fica intocado.
 */
import { Quaternion, Vector3, type Object3D } from 'three';
import type { Vehicle } from './RapierPhysics.js';

/** Opções do {@link VehicleLean}. */
export interface VehicleLeanOptions {
  /** Inclinação máxima (rad). Default 0.6 (~34°). */
  maxLean?: number;
  /** Suavização (1/s): quão rápido a inclinação chega no alvo. Default 6. */
  leanRate?: number;
  /** Gravidade (m/s²) da fórmula de equilíbrio. Default 9.81. */
  gravity?: number;
}

/** O que a inclinação lê do veículo (o `Vehicle` atende). */
export type VehicleLeanSource = Pick<Vehicle, 'forwardSpeed'> & {
  readonly body: Pick<Vehicle['body'], 'angvel' | 'rotation'>;
};

const DEFAULT_MAX_LEAN = 0.6;
const DEFAULT_LEAN_RATE = 6;
const DEFAULT_GRAVITY = 9.81;
const Z_AXIS = new Vector3(0, 0, 1);
const _up = new Vector3();
const _rot = new Quaternion();
const _roll = new Quaternion();

/**
 * Inclina um nó visual conforme a curva do veículo.
 *
 * @example
 * // jogador: pela opção do VehicleControlSystem
 * new VehicleControlSystem(physics, vehicle, motoMesh, camera, gamepad, input, { lean: { object: 'Body' } });
 * // frota: no componente
 * arcadeComponent.lean = new VehicleLean(motoMesh.getObjectByName('Body')!, { maxLean: 0.5 });
 */
export class VehicleLean {
  /** Inclinação atual (rad, em torno do +Z local; positivo tomba para a direita do piloto). */
  angle = 0;
  private readonly base: Quaternion;
  private readonly maxLean: number;
  private readonly leanRate: number;
  private readonly gravity: number;

  constructor(
    /** Nó FILHO da malha do chassi (a raiz recebe a pose do corpo e perderia a rotação). */
    readonly object: Object3D,
    options: VehicleLeanOptions = {},
  ) {
    this.base = object.quaternion.clone();
    this.maxLean = options.maxLean ?? DEFAULT_MAX_LEAN;
    this.leanRate = options.leanRate ?? DEFAULT_LEAN_RATE;
    this.gravity = options.gravity ?? DEFAULT_GRAVITY;
  }

  /** Aproxima a inclinação do alvo deste quadro e grava no nó. `dt` em segundos. */
  update(vehicle: VehicleLeanSource, dt: number): void {
    const r = vehicle.body.rotation();
    const w = vehicle.body.angvel();
    _up.set(0, 1, 0).applyQuaternion(_rot.set(r.x, r.y, r.z, r.w));
    const yawRate = w.x * _up.x + w.y * _up.y + w.z * _up.z;
    // Guinada + com forward + = curva à esquerda → tomba para +X (rotação Z negativa).
    const equilibrium = -Math.atan((vehicle.forwardSpeed() * yawRate) / this.gravity);
    const target = Math.max(-this.maxLean, Math.min(this.maxLean, equilibrium));
    this.angle += (target - this.angle) * Math.min(1, dt * this.leanRate);
    this.object.quaternion.copy(this.base).multiply(_roll.setFromAxisAngle(Z_AXIS, this.angle));
  }
}
