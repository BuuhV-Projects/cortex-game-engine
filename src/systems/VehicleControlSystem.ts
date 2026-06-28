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
  /** Freio de mão (Espaço/A) — trava as rodas. Default 120 (mais forte que o freio normal). */
  handbrakeForce?: number;
  /**
   * Freio de **resistência ao rolamento / freio-motor** aplicado ao soltar acelerador e
   * freio (senão o carro não desacelera). Default 4.
   */
  rollingResistance?: number;
  /** Suavização do acelerador (1/s) — evita arranque brusco/empinada. Default 3. */
  throttleSmooth?: number;
  /** Giro EXTRA das rodas com tração sob aceleração (rad/s no talo) — wheelspin visual. Default 18. */
  wheelSpinRate?: number;
  /** Esterço máximo (rad). Default 0.7. */
  maxSteer?: number;
  /** Suavização do esterço (1/s). Default 8. */
  steerSmooth?: number;
  /**
   * Malhas das rodas (na ORDEM das rodas do veículo) — sincronizadas a cada frame
   * (suspensão sobe/desce, esterço, rolagem). Devem ser filhas do `car`.
   */
  wheelObjects?: Object3D[];
  /** Câmera chase: distância e altura. Default 8 / 3.5. */
  camDistance?: number;
  camHeight?: number;
  /** Sensibilidade do mouse pra orbitar a câmera (rad/px). Default 0.0022. */
  lookSensitivity?: number;
  /** Velocidade de órbita pelo 2º stick (rad/s). Default 2.5. */
  padLookSpeed?: number;
  /** Inverte o eixo Y do olhar. Default false. */
  invertLookY?: boolean;
  /** Quão rápido a câmera recentra atrás ao dirigir (1/s). Default 2. */
  camFollowRate?: number;
  /** Tempo sem olhar (s) até começar a recentrar atrás. Default 1.2. */
  recenterDelay?: number;
  /** Só dirige/posiciona a câmera quando `true` (ex.: `() => car.driving`). Default sempre. */
  active?: () => boolean;
  /** Pausa total (ex.: `() => game.editorActive`). */
  pauseWhen?: () => boolean;
}

const _fwd = new Vector3();
const _q = new Quaternion();
const _camPos = new Vector3();
const _wp = new Vector3();
const _wq = new Quaternion();

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
  private wheelSpin = 0; // giro extra acumulado (wheelspin sob aceleração)
  private camYaw = 0;
  private camPitch = 0.32;
  private lookIdle = 999;
  private camInit = false;

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
      let handbrake = this.gamepad.isButtonDown(0, 0); // A = freio de mão (controle)
      if (this.input) {
        const k = this.input;
        if (accel < 0.05 && (k.isKeyDown('w') || k.isKeyDown('ArrowUp'))) accel = 1;
        if (brakeIn < 0.05 && (k.isKeyDown('s') || k.isKeyDown('ArrowDown'))) brakeIn = 1;
        if (k.isKeyDown(' ')) handbrake = true; // Espaço = freio (handbrake)
        if (Math.abs(steerIn) < 0.05) {
          if (k.isKeyDown('d') || k.isKeyDown('ArrowRight')) steerIn = 1;
          else if (k.isKeyDown('a') || k.isKeyDown('ArrowLeft')) steerIn = -1;
        }
      }
      const fwd = this.vehicle.forwardSpeed();

      // Acelerador com RAMPA (suaviza o arranque, evita empinar a frente).
      this.throttle += (accel - this.throttle) * Math.min(1, dt * (o.throttleSmooth ?? 3));
      this.wheelSpin += this.throttle * (o.wheelSpinRate ?? 18) * dt; // wheelspin visual sob aceleração
      const maxBrake = o.maxBrake ?? 50;

      // Acelera pra frente; LT andando pra frente = freio; LT ~parado/ré = motor reverso.
      const reversing = !handbrake && brakeIn > 0.1 && fwd < 1;
      this.vehicle.setEngineForce(
        handbrake ? 0 : this.throttle * engine - (reversing ? brakeIn * (o.reverseForce ?? engine * 0.45) : 0),
      );
      // Freio: Espaço/A (handbrake, sempre), ou LT andando pra frente; ao soltar tudo,
      // freio-motor leve (senão não desacelera).
      const coasting = !handbrake && this.throttle < 0.05 && brakeIn < 0.05;
      this.vehicle.setBrake(
        handbrake
          ? (o.handbrakeForce ?? 120) // freio de mão: trava forte
          : brakeIn > 0.1 && fwd >= 1
            ? brakeIn * maxBrake
            : coasting
              ? (o.rollingResistance ?? 4)
              : 0,
      );

      const target = -steerIn * (o.maxSteer ?? 0.7);
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

    // Sincroniza as rodas (filhas do carro): suspensão + esterço + rolagem.
    const wheels = o.wheelObjects;
    if (wheels) {
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (!w) continue;
        const extra = this.vehicle.wheels[i]?.powered ? this.wheelSpin : 0; // wheelspin só nas com tração
        this.vehicle.wheelLocalTransform(i, _wp, _wq, extra);
        w.position.copy(_wp);
        w.quaternion.copy(_wq);
      }
    }

    if (driving) this.placeCamera(t, r, dt);
  }

  /**
   * Chase cam ORBITAL: mouse (pointer lock) + 2º stick giram a câmera em volta do carro;
   * ao dirigir pra frente sem olhar, recentra atrás (auto-follow). Igual ao 3ª pessoa.
   */
  private placeCamera(t: { x: number; y: number; z: number }, r: { x: number; y: number; z: number; w: number }, dt: number): void {
    const o = this.options;
    const dist = o.camDistance ?? 8;
    const height = o.camHeight ?? 3.5;

    // Heading do carro (yaw do forward +Z).
    _fwd.set(0, 0, 1).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
    const carYaw = Math.atan2(_fwd.x, _fwd.z);
    if (!this.camInit) { this.camYaw = carYaw; this.camInit = true; }

    // Olhar: mouse (pointer lock) + 2º stick (eixos 2/3).
    let dYaw = 0;
    let dPitch = 0;
    if (this.input && typeof document !== 'undefined' && document.pointerLockElement) {
      const md = this.input.getMouseDelta();
      dYaw -= md.x * (o.lookSensitivity ?? 0.0022);
      dPitch -= md.y * (o.lookSensitivity ?? 0.0022);
    }
    const padLook = o.padLookSpeed ?? 2.5;
    dYaw -= this.gamepad.getAxis(0, 2) * padLook * dt;
    dPitch += (o.invertLookY ? -1 : 1) * this.gamepad.getAxis(0, 3) * padLook * dt;

    const looking = Math.abs(dYaw) > 1e-4 || Math.abs(dPitch) > 1e-4;
    this.camYaw += dYaw;
    this.camPitch = Math.max(-0.2, Math.min(1.2, this.camPitch + dPitch));
    this.lookIdle = looking ? 0 : this.lookIdle + dt;

    // Auto-follow: sem olhar há um tempo + andando, recentra atrás do carro.
    if (this.lookIdle > (o.recenterDelay ?? 1.2) && Math.abs(this.vehicle.forwardSpeed()) > 2) {
      let diff = carYaw - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * (o.camFollowRate ?? 2));
    }

    const cosP = Math.cos(this.camPitch);
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    _camPos.set(
      t.x - fx * dist * cosP,
      t.y + height + dist * Math.sin(this.camPitch),
      t.z - fz * dist * cosP,
    );
    this.camera.position.copy(_camPos);
    this.camera.lookAt(t.x, t.y + 1, t.z);
  }
}
