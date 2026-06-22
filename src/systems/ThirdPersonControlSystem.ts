import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import type { InputManager } from '../core/InputManager.js';
import type { SceneAnimator } from '../scene/SceneAnimator.js';
import { deriveLocomotion, autoMapPlayerClips } from './PlatformerAnimationSystem.js';

/** Opções do {@link ThirdPersonControlSystem} (porta o ThirdPersonController do Unity StarterAssets). */
export interface ThirdPersonControlOptions {
  /** Velocidade de caminhada (u/s). Default 2.0 (Unity MoveSpeed). */
  moveSpeed?: number;
  /** Velocidade de corrida com Shift (u/s). Default 5.335 (Unity SprintSpeed). */
  sprintSpeed?: number;
  /** Sensibilidade do mouse (rad/px). Default 0.0022. */
  sensitivity?: number;
  /** Suavização da rotação do personagem ao virar (s). Default 0.12 (Unity RotationSmoothTime). */
  rotationSmoothTime?: number;
  /** Distância da câmera atrás do personagem (m). Default 5.5. */
  cameraDistance?: number;
  /** Altura do alvo que a câmera mira (m, acima dos pés). Default 1.5. */
  cameraHeight?: number;
  /** Acima de qual velocidade troca walk→run (u/s). Default 3.5. */
  runThreshold?: number;
  /** Offset de orientação do modelo (rad) se o personagem nascer virado ao contrário. Default 0. */
  facingOffset?: number;
  /** Pausa (ex.: `() => game.editorActive`). Quando true, não move/olha (mostra o corpo). */
  pauseWhen?: () => boolean;
}

const TOP_CLAMP = (70 * Math.PI) / 180; // Unity TopClamp 70°
const BOTTOM_CLAMP = (-30 * Math.PI) / 180; // Unity BottomClamp -30°

/** Interpola um ângulo (rad) em direção a `target` pelo menor caminho (smoothing exponencial). */
function approachAngle(current: number, target: number, t: number): number {
  let d = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return current + d * t;
}

/**
 * **Controle de terceira pessoa** — porta o `ThirdPersonController` do Unity
 * StarterAssets (comportamento; a arte é separada): câmera **orbital por mouse**
 * (pointer lock, pitch clampado), **movimento relativo à câmera** (WASD), o
 * personagem **vira suavemente** pra direção do movimento, **corre** com Shift e
 * **pula** com Espaço (sobre o {@link CharacterBodyComponent} — gravidade/colisão).
 * Também dirige a **animação** (idle/walk/run/jump/fall) do `.glb` via
 * `SceneAnimator` (em `userData.cortexAnim`).
 *
 * Mira a única entidade com {@link TransformComponent} + {@link CharacterBodyComponent}.
 * Roda em `priority = 20` (depois da física). Pausa no editor via `pauseWhen`.
 */
export class ThirdPersonControlSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 20;

  private readonly moveSpeed: number;
  private readonly sprintSpeed: number;
  private readonly sensitivity: number;
  private readonly rotSmooth: number;
  private readonly camDist: number;
  private readonly camHeight: number;
  private readonly runThreshold: number;
  private readonly facingOffset: number;
  private readonly shouldPause?: () => boolean;

  private yaw = 0;
  private pitch = 0.35; // levemente de cima
  private prevJump = false;
  private clipMap: Record<string, string> | null = null;
  private currentClip: string | null = null;
  private readonly lookTarget = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly canvas: HTMLElement,
    options: ThirdPersonControlOptions = {},
  ) {
    super();
    this.moveSpeed = options.moveSpeed ?? 2.0;
    this.sprintSpeed = options.sprintSpeed ?? 5.335;
    this.sensitivity = options.sensitivity ?? 0.0022;
    this.rotSmooth = options.rotationSmoothTime ?? 0.12;
    this.camDist = options.cameraDistance ?? 5.5;
    this.camHeight = options.cameraHeight ?? 1.5;
    this.runThreshold = options.runThreshold ?? 3.5;
    this.facingOffset = options.facingOffset ?? 0;
    this.shouldPause = options.pauseWhen;

    if (typeof document !== 'undefined') {
      this.canvas.addEventListener('mousedown', () => {
        if (this.shouldPause?.()) return;
        if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
      });
    }
  }

  override update(entities: Entity[], deltaTime: number): void {
    const player = entities[0];
    if (!player) return;
    const t = player.getComponent(TransformComponent)!;
    const body = player.getComponent(CharacterBodyComponent)!;
    const obj = player.getComponent(Object3DComponent)?.object;
    if (this.shouldPause?.()) {
      // No editor o corpo fica visível e parado; ainda assim posiciona a câmera.
      this.placeCamera(t);
      return;
    }
    const dt = deltaTime / 1000;

    // ── Mouse-look (orbita a câmera; só com pointer lock) ─────────────────────
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
      const md = this.input.getMouseDelta();
      this.yaw -= md.x * this.sensitivity;
      this.pitch += md.y * this.sensitivity;
      if (this.pitch > TOP_CLAMP) this.pitch = TOP_CLAMP;
      if (this.pitch < BOTTOM_CLAMP) this.pitch = BOTTOM_CLAMP;
    }

    // ── Movimento relativo à câmera (XZ) ──────────────────────────────────────
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos; // frente da câmera projetada no chão
    const rx = cos, rz = -sin; // direita
    let mx = 0, mz = 0;
    const k = this.input;
    if (k.isKeyDown('w') || k.isKeyDown('ArrowUp')) { mx += fx; mz += fz; }
    if (k.isKeyDown('s') || k.isKeyDown('ArrowDown')) { mx -= fx; mz -= fz; }
    if (k.isKeyDown('d') || k.isKeyDown('ArrowRight')) { mx += rx; mz += rz; }
    if (k.isKeyDown('a') || k.isKeyDown('ArrowLeft')) { mx -= rx; mz -= rz; }

    const len = Math.hypot(mx, mz);
    const sprint = k.isKeyDown('Shift') || k.isKeyDown('shift');
    const speed = sprint ? this.sprintSpeed : this.moveSpeed;
    let movingSpeed = 0;
    if (len > 0) {
      const dx = mx / len, dz = mz / len;
      t.x += dx * speed * dt;
      t.z += dz * speed * dt;
      movingSpeed = speed;
      // Vira o personagem suavemente pra direção do movimento (forward = (-sin,-cos)).
      const targetYaw = Math.atan2(-dx, -dz) + this.facingOffset;
      const smoothT = this.rotSmooth > 0 ? 1 - Math.exp(-dt / this.rotSmooth) : 1;
      t.rotationY = approachAngle(t.rotationY, targetYaw, smoothT);
    }

    // ── Pulo (borda de pressão) ───────────────────────────────────────────────
    const jumpDown = k.isKeyDown(' ');
    if (jumpDown && !this.prevJump) body.jump();
    this.prevJump = jumpDown;

    // ── Câmera orbital atrás do personagem ────────────────────────────────────
    this.placeCamera(t);

    // ── Animação (idle/walk/run/jump/fall) ────────────────────────────────────
    if (obj) this.drive(obj, movingSpeed, body);
  }

  /** Posiciona a câmera atrás/acima conforme yaw/pitch, mirando a cabeça do alvo. */
  private placeCamera(t: TransformComponent): void {
    const cp = Math.cos(this.pitch);
    const back = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.camera.position.set(
      t.x + back.x * this.camDist,
      t.y + this.camHeight + back.y * this.camDist,
      t.z + back.z * this.camDist,
    );
    this.lookTarget.set(t.x, t.y + this.camHeight, t.z);
    this.camera.lookAt(this.lookTarget);
  }

  /** Escolhe e toca o clipe de locomoção pelo estado do CharacterBody. */
  private drive(obj: THREE.Object3D, horizontalSpeed: number, body: CharacterBodyComponent): void {
    const animator = (obj.userData as Record<string, unknown>)['cortexAnim'] as SceneAnimator | undefined;
    if (!animator) return;
    if (!this.clipMap) this.clipMap = autoMapPlayerClips(animator.clipNames());
    const state = deriveLocomotion(
      { vx: horizontalSpeed, vy: body.velocityY, grounded: body.grounded },
      this.runThreshold,
    );
    const clip = this.clipMap[state] ?? state;
    if (clip !== this.currentClip) {
      const oneShot = state === 'jump';
      animator.play(clip, { loop: !oneShot });
      this.currentClip = clip;
    }
  }
}
