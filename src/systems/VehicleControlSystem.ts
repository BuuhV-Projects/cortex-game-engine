import { Vector3, Quaternion, type PerspectiveCamera, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { RapierPhysics, Vehicle } from '../physics/RapierPhysics.js';
import type { GamepadManager } from '../core/GamepadManager.js';
import type { InputManager } from '../core/InputManager.js';
import type { InputActions } from '../input/InputActions.js';

/** Opções do {@link VehicleControlSystem}. */
export interface VehicleControlOptions {
  /** Força do motor (N) com acelerador no talo. Default 5000. */
  engineForce?: number;
  /** Força de ré (acelera de ré). Default `engineForce * 0.7`. */
  reverseForce?: number;
  /** Velocidade MÁXIMA de ré (m/s). Default 8.33 (~30 km/h). */
  maxReverseSpeed?: number;
  /** Velocidade MÁXIMA pra frente (km/h) — limita o carro (e o ponteiro). Default sem limite. */
  maxSpeedKmh?: number;
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
  /** Esterço máximo (rad). Default 0.7. */
  maxSteer?: number;
  /** Suavização do esterço (1/s). Default 8. */
  steerSmooth?: number;
  /**
   * Reduz o esterço na velocidade (0..1) — curva mais suave rápido, **anti-capotamento**.
   * Ex.: 0.5 = perde metade do esterço a partir de `steerSpeedRef`. Default 0.5.
   */
  steerSpeedReduction?: number;
  /** Velocidade (m/s) em que a redução de esterço chega ao máximo. Default 28. */
  steerSpeedRef?: number;
  /** Força do estabilizador anti-capotamento (puxa o carro pra cima). 0 = desliga. Default 14. */
  uprightStrength?: number;
  /** Amortecimento da rolagem (anti-capotamento). Default 7. */
  uprightDamping?: number;
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
  /**
   * **Ações de input remapeáveis** (ADR-0164) — passe `game.actions` pra dirigir
   * pelas ações `accelerate`/`brake`/`handbrake` + `moveLeft`/`moveRight`
   * (grupo `vehicle` da tela de Controles). Sem isso, valem RT/LT/stick e o
   * fallback WASD fixos.
   */
  actions?: InputActions;
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
  private wheelRoll = 0; // ângulo de rolagem acumulado (todas as rodas, pela velocidade)
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
      const acts = this.options.actions;
      let accel = acts ? acts.value('accelerate') : this.gamepad.getButtonValue(0, 7); // RT
      let brakeIn = acts ? acts.value('brake') : this.gamepad.getButtonValue(0, 6); // LT
      let steerIn = acts ? acts.axis('moveLeft', 'moveRight') : this.gamepad.getAxis(0, 0);
      let handbrake = acts ? acts.isDown('handbrake') : this.gamepad.isButtonDown(0, 0); // A
      // Com mapa de ações, teclado e controle já entram juntos pelos bindings.
      if (this.input && !acts) {
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
      const maxBrake = o.maxBrake ?? 50;

      // Limitador de velocidade MÁX (km/h → m/s): corta o motor no teto (o ponteiro/carro
      // não passam do valor definido).
      const topSpeed = o.maxSpeedKmh ? o.maxSpeedKmh / 3.6 : Infinity;
      const forwardForce = fwd >= topSpeed ? 0 : this.throttle * engine;
      // Ré: acelera de ré (mais forte) até o teto de ré (maxReverseSpeed, ~30 km/h).
      const maxRev = o.maxReverseSpeed ?? 8.33;
      const reversing = !handbrake && brakeIn > 0.1 && fwd < 1 && fwd > -maxRev;
      const reverseForce = reversing ? brakeIn * (o.reverseForce ?? engine * 0.7) : 0;
      this.vehicle.setEngineForce(handbrake ? 0 : forwardForce - reverseForce);
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

      // Esterço diminui com a velocidade (curva mais suave rápido → não capota).
      const reduction = (o.steerSpeedReduction ?? 0.5) * Math.min(1, Math.abs(fwd) / (o.steerSpeedRef ?? 28));
      const target = -steerIn * (o.maxSteer ?? 0.7) * (1 - reduction);
      this.steer += (target - this.steer) * Math.min(1, dt * (o.steerSmooth ?? 8));
      this.vehicle.setSteering(this.steer);
    } else {
      this.vehicle.setEngineForce(0);
      this.vehicle.setBrake(o.maxBrake ?? 50); // estacionado: freio segurando
    }

    this.vehicle.update(dt);
    const upright = o.uprightStrength ?? 14;
    if (upright > 0) this.vehicle.keepUpright(upright, o.uprightDamping ?? 7, dt); // anti-capotamento
    this.physics.step();

    // Sincroniza a malha do carro ao chassi.
    const t = this.vehicle.chassisTranslation();
    const r = this.vehicle.chassisRotation();
    this.car.position.set(t.x, t.y, t.z);
    this.car.quaternion.set(r.x, r.y, r.z, r.w);

    // Sincroniza as rodas (filhas do carro): suspensão + esterço + ROLAGEM por velocidade.
    // A rolagem vem da velocidade do carro (todas as rodas giram quando há velocidade,
    // acelerando ou não) — o wheelRotation do Rapier não é confiável pra isso.
    const wheels = o.wheelObjects;
    if (wheels) {
      const radius = this.vehicle.wheels[0]?.radius ?? 0.4;
      this.wheelRoll += (this.vehicle.forwardSpeed() / radius) * dt; // rad
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (!w) continue;
        this.vehicle.wheelLocalTransform(i, _wp, _wq, this.wheelRoll);
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
      dPitch += md.y * (o.lookSensitivity ?? 0.0022); // mesmo sinal do 3ª pessoa (não inverter)
    }
    const padLook = o.padLookSpeed ?? 2.5;
    const lookX = o.actions ? o.actions.axis('lookLeft', 'lookRight') : this.gamepad.getAxis(0, 2);
    const lookY = o.actions ? o.actions.axis('lookUp', 'lookDown') : this.gamepad.getAxis(0, 3);
    dYaw -= lookX * padLook * dt;
    dPitch += (o.invertLookY ? -1 : 1) * lookY * padLook * dt;

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
