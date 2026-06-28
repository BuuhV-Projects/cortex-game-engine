import { Vector3, Quaternion, type PerspectiveCamera, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { RapierPhysics, Vehicle } from '../physics/RapierPhysics.js';
import type { GamepadManager } from '../core/GamepadManager.js';
import type { InputManager } from '../core/InputManager.js';

/** Opções do {@link VehicleControlSystem}. */
export interface VehicleControlOptions {
  /** Força do motor (N) com acelerador no talo. Default 5000. */
  engineForce?: number;
  /** Força de ré com LT parado. Default `engineForce * 0.45`. */
  reverseForce?: number;
  /** Freio máximo (LT andando pra frente). Default 50. */
  maxBrake?: number;
  /**
   * Freio de **resistência ao rolamento / freio-motor** aplicado ao soltar acelerador e
   * freio (senão o carro não desacelera). Default 4.
   */
  rollingResistance?: number;
  /** Suavização do acelerador (1/s) — evita arranque brusco/empinada. Default 3. */
  throttleSmooth?: number;
  /** Esterço máximo (rad). Default 0.55. */
  maxSteer?: number;
  /** Suavização do esterço (1/s). Default 8. */
  steerSmooth?: number;
  /** Câmera chase: distância e altura. Default 8 / 3.5. */
  camDistance?: number;
  camHeight?: number;
  /** Só dirige/posiciona a câmera quando `true` (ex.: `() => car.driving`). Default sempre. */
  active?: () => boolean;
  /** Pausa total (ex.: `() => game.editorActive`). */
  pauseWhen?: () => boolean;
}

const _fwd = new Vector3();
const _q = new Quaternion();
const _camPos = new Vector3();

/**
 * Dirige um {@link Vehicle} do Rapier (ADR-0081), gamepad-first com **fallback
 * teclado**: com controle, **RT** acelera, **LT** freia (e dá ré parado), **stick X**
 * esterça; SEM controle (`gamepad.isConnected(0) === false`), **W/↑** acelera, **S/↓**
 * freia/ré, **A·D / ←·→** esterça. Roda `vehicle.update(dt)` e o `physics.step()`
 * (DEPOIS — convenção do Rapier), sincroniza a malha do carro ao chassi e posiciona a
 * **chase cam**. `priority = 30` (DEPOIS da câmera de 3ª pessoa, que é 20 — senão ela
 * sobrescreveria a chase cam ao dirigir). As rodas raycastam no WASM (sem custo de CPU).
 */
export class VehicleControlSystem extends System {
  static override requiredComponents = [];
  override priority = 30;

  private steer = 0;
  private throttle = 0;

  constructor(
    private readonly physics: RapierPhysics,
    private readonly vehicle: Vehicle,
    private readonly car: Object3D,
    private readonly camera: PerspectiveCamera,
    private readonly gamepad: GamepadManager,
    /** Teclado (fallback quando não há controle). Opcional. */
    private readonly input?: InputManager,
    private readonly options: VehicleControlOptions = {},
  ) {
    super();
    this.pauseWhen = options.pauseWhen;
  }

  override update(_entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    const o = this.options;
    const driving = o.active?.() ?? true;
    const engine = o.engineForce ?? 5000;

    if (driving) {
      // Gamepad-first; o teclado PREENCHE quando o controle está ocioso — sem controle
      // OU controle-fantasma "conectado" mas parado (Electron às vezes reporta um). Por
      // isso combinamos em vez de travar em `isConnected`: assim o teclado sempre dirige.
      let accel = this.gamepad.getButtonValue(0, 7); // RT
      let brakeIn = this.gamepad.getButtonValue(0, 6); // LT
      let steerIn = this.gamepad.getAxis(0, 0);
      if (this.input) {
        const k = this.input;
        if (accel < 0.05 && (k.isKeyDown('w') || k.isKeyDown('ArrowUp'))) accel = 1;
        if (brakeIn < 0.05 && (k.isKeyDown('s') || k.isKeyDown('ArrowDown'))) brakeIn = 1;
        if (Math.abs(steerIn) < 0.05) {
          if (k.isKeyDown('d') || k.isKeyDown('ArrowRight')) steerIn = 1;
          else if (k.isKeyDown('a') || k.isKeyDown('ArrowLeft')) steerIn = -1;
        }
      }
      const fwd = this.vehicle.forwardSpeed();

      // Acelerador com RAMPA (suaviza o arranque, evita empinar a frente).
      this.throttle += (accel - this.throttle) * Math.min(1, dt * (o.throttleSmooth ?? 3));

      // Acelera pra frente; LT andando pra frente = freio; LT ~parado/ré = motor reverso.
      const reversing = brakeIn > 0.1 && fwd < 1;
      this.vehicle.setEngineForce(this.throttle * engine - (reversing ? brakeIn * (o.reverseForce ?? engine * 0.45) : 0));
      // Freio: LT andando pra frente. Ao SOLTAR tudo, freio-motor leve (senão não desacelera).
      const coasting = this.throttle < 0.05 && brakeIn < 0.05;
      this.vehicle.setBrake(
        brakeIn > 0.1 && fwd >= 1 ? brakeIn * (o.maxBrake ?? 50) : coasting ? (o.rollingResistance ?? 4) : 0,
      );

      const target = -steerIn * (o.maxSteer ?? 0.55);
      this.steer += (target - this.steer) * Math.min(1, dt * (o.steerSmooth ?? 8));
      this.vehicle.setSteering(this.steer);
    } else {
      this.vehicle.setEngineForce(0);
      this.vehicle.setBrake(o.maxBrake ?? 50); // estacionado: freio segurando
    }

    this.vehicle.update(dt);
    this.physics.step();

    // Sincroniza a malha do carro ao chassi.
    const t = this.vehicle.chassisTranslation();
    const r = this.vehicle.chassisRotation();
    this.car.position.set(t.x, t.y, t.z);
    this.car.quaternion.set(r.x, r.y, r.z, r.w);

    if (driving) this.placeCamera(t, r);
  }

  private placeCamera(t: { x: number; y: number; z: number }, r: { x: number; y: number; z: number; w: number }): void {
    const dist = this.options.camDistance ?? 8;
    const height = this.options.camHeight ?? 3.5;
    _fwd.set(0, 0, 1).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)); // forward do carro (+Z)
    _camPos.set(t.x - _fwd.x * dist, t.y + height, t.z - _fwd.z * dist);
    this.camera.position.copy(_camPos);
    this.camera.lookAt(t.x, t.y + 1, t.z);
  }
}
