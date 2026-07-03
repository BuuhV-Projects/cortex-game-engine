import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import type { InputManager } from '../core/InputManager.js';
import type { GamepadManager } from '../core/GamepadManager.js';
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
  /** Velocidade de orbita da câmera pelo stick direito do gamepad (rad/s). Default 2.6. */
  padLookSpeed?: number;
  /** Inverte o eixo Y do stick direito (olhar). Default false. */
  invertLookY?: boolean;
  /** Slot do gamepad (0..3). Default 0. */
  padIndex?: number;
  /** Pausa (ex.: `() => game.editorActive`). Quando true, não move/olha (mostra o corpo). */
  pauseWhen?: () => boolean;
  /** Bloqueia o pulo quando `true` — ex.: há interação em alcance, então A vira "interagir". */
  jumpBlocked?: () => boolean;
}

const TOP_CLAMP = (70 * Math.PI) / 180; // Unity TopClamp 70°
const BOTTOM_CLAMP = (-30 * Math.PI) / 180; // Unity BottomClamp -30°
/** Distância mínima alvo↔câmera (não entra dentro do personagem) e folga da colisão. */
const CAM_MIN_DIST = 0.8;
const CAM_SKIN = 0.3;
/**
 * Distância abaixo da qual o PERSONAGEM é ocultado (occlusion fade estilo Unity):
 * quando o spring arm puxa a câmera pra muito perto (parede/árvore atrás), sem
 * isso a câmera entra DENTRO da cabeça do modelo (near plane corta a malha).
 */
const CAM_HIDE_DIST = 1.05;
/** Duração (s) que o clipe `run_stop` segura antes de cair pro idle. */
const RUN_STOP_DUR = 0.45;

/** A câmera ignora (não colide com) o próprio player e os gizmos/chrome do editor. */
function isCamIgnored(obj: THREE.Object3D, self?: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (self && p === self) return true;
    if (p.userData['editorInternal']) return true;
    p = p.parent;
  }
  return false;
}

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
  private readonly padLookSpeed: number;
  private readonly invertLookY: boolean;
  private readonly padIndex: number;
  private readonly shouldPause?: () => boolean;
  private readonly jumpBlocked?: () => boolean;

  private yaw = 0;
  private pitch = 0.35; // levemente de cima
  private prevJump = false;
  private clipMap: Record<string, string> | null = null;
  private clipSet: Set<string> | null = null; // nomes de clipe disponíveis (run_stop/run_jump?)
  private currentClip: string | null = null;
  private wasRunning = false; // corria no último frame no chão (persiste no ar p/ run_jump)
  private oneShotLock = 0; // s restantes segurando um one-shot (run_stop)
  private actionClip: string | null = null; // ação one-shot pedida pelo jogo (soco, etc.)
  private actionLock = 0; // s restantes segurando a ação
  private readonly lookTarget = new THREE.Vector3();
  private readonly camRay = new THREE.Raycaster();
  private readonly camBack = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly canvas: HTMLElement,
    options: ThirdPersonControlOptions = {},
    private readonly gamepad?: GamepadManager,
    /** Raiz da cena pra COLISÃO de câmera (spring arm): se algo fica entre o alvo e a
     * câmera (chão/árvore/parede), a câmera é puxada pra dentro. Opcional. */
    private readonly collisionRoot?: THREE.Object3D,
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
    this.padLookSpeed = options.padLookSpeed ?? 2.6;
    this.invertLookY = options.invertLookY ?? false;
    this.padIndex = options.padIndex ?? 0;
    this.shouldPause = options.pauseWhen;
    this.jumpBlocked = options.jumpBlocked;

    if (typeof document !== 'undefined') {
      this.canvas.addEventListener('mousedown', () => {
        if (this.shouldPause?.()) return;
        if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
      });
    }
  }

  /**
   * Toca uma **ação one-shot** (soco, aceno, etc.) por `duration` segundos, sobrepondo
   * a locomoção — o jogo chama isso num botão (combate/interação). O clipe precisa
   * existir no `.glb`; senão é ignorado.
   */
  playAction(clip: string, duration: number): void {
    this.actionClip = clip;
    this.actionLock = duration;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const player = entities[0];
    if (!player) return;
    const t = player.getComponent(TransformComponent)!;
    const body = player.getComponent(CharacterBodyComponent)!;
    const obj = player.getComponent(Object3DComponent)?.object;
    if (this.shouldPause?.()) {
      // No editor o corpo fica visível e parado; ainda assim posiciona a câmera.
      this.placeCamera(t, obj);
      return;
    }
    const dt = deltaTime / 1000;
    const k = this.input;
    const gp = this.gamepad;
    const pad = this.padIndex;

    // ── Olhar: mouse (pointer lock) + stick direito do gamepad (Xbox-first) ────
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
      const md = this.input.getMouseDelta();
      this.yaw -= md.x * this.sensitivity;
      this.pitch += md.y * this.sensitivity;
    }
    if (gp) {
      this.yaw -= gp.getAxis(pad, 2) * this.padLookSpeed * dt;
      this.pitch += (this.invertLookY ? -1 : 1) * gp.getAxis(pad, 3) * this.padLookSpeed * dt;
    }
    if (this.pitch > TOP_CLAMP) this.pitch = TOP_CLAMP;
    if (this.pitch < BOTTOM_CLAMP) this.pitch = BOTTOM_CLAMP;

    // ── Direção relativa à câmera (XZ) ────────────────────────────────────────
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos; // frente da câmera projetada no chão
    const rx = cos, rz = -sin; // direita

    // Stick esquerdo (analógico) tem prioridade; senão WASD (direção unitária).
    const lx = gp ? gp.getAxis(pad, 0) : 0;
    const ly = gp ? gp.getAxis(pad, 1) : 0;
    const stickMag = Math.hypot(lx, ly);
    let mx = 0, mz = 0, inputMag = 0;
    if (stickMag > 0) {
      mx = fx * -ly + rx * lx; // stick pra cima (ly<0) = frente
      mz = fz * -ly + rz * lx;
      inputMag = Math.min(1, stickMag);
    } else {
      if (k.isKeyDown('w') || k.isKeyDown('ArrowUp')) { mx += fx; mz += fz; }
      if (k.isKeyDown('s') || k.isKeyDown('ArrowDown')) { mx -= fx; mz -= fz; }
      if (k.isKeyDown('d') || k.isKeyDown('ArrowRight')) { mx += rx; mz += rz; }
      if (k.isKeyDown('a') || k.isKeyDown('ArrowLeft')) { mx -= rx; mz -= rz; }
      if (mx !== 0 || mz !== 0) inputMag = 1;
    }

    // Corre: Shift (teclado) ou RT (botão 7) do gamepad.
    const sprint = k.isKeyDown('Shift') || k.isKeyDown('shift') || (gp?.isButtonDown(pad, 7) ?? false);
    const dirLen = Math.hypot(mx, mz);
    let movingSpeed = 0;
    if (dirLen > 0 && inputMag > 0) {
      const dx = mx / dirLen, dz = mz / dirLen;
      const speed = (sprint ? this.sprintSpeed : this.moveSpeed) * inputMag; // analógico
      t.x += dx * speed * dt;
      t.z += dz * speed * dt;
      movingSpeed = speed;
      // Vira o personagem suavemente pra direção do movimento (forward = (-sin,-cos)).
      const targetYaw = Math.atan2(-dx, -dz) + this.facingOffset;
      const smoothT = this.rotSmooth > 0 ? 1 - Math.exp(-dt / this.rotSmooth) : 1;
      t.rotationY = approachAngle(t.rotationY, targetYaw, smoothT);
    }

    // ── Pulo (borda de pressão): Espaço ou A (botão 0) ────────────────────────
    // Bloqueado quando há interação em alcance (A vira "interagir", não pula).
    const jumpDown = k.isKeyDown(' ') || (gp?.isButtonDown(pad, 0) ?? false);
    if (jumpDown && !this.prevJump && !(this.jumpBlocked?.() ?? false)) body.jump();
    this.prevJump = jumpDown;

    // ── Câmera orbital atrás do personagem (com colisão) ──────────────────────
    this.placeCamera(t, obj);

    // ── Animação (idle/walk/run/jump/fall + run_stop/run_jump) ────────────────
    if (obj) this.drive(obj, movingSpeed, body, dt);
  }

  /** Posiciona a câmera atrás/acima conforme yaw/pitch, mirando a cabeça do alvo. */
  private placeCamera(t: TransformComponent, self?: THREE.Object3D): void {
    const cp = Math.cos(this.pitch);
    this.camBack.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.lookTarget.set(t.x, t.y + this.camHeight, t.z);

    // Colisão (spring arm): se algo (chão/árvore/parede) fica entre o alvo e a câmera,
    // puxa a câmera pra dentro — nunca atravessa o chão. Raio do alvo na direção da câmera.
    let dist = this.camDist;
    if (this.collisionRoot) {
      this.camRay.set(this.lookTarget, this.camBack);
      this.camRay.far = this.camDist;
      for (const h of this.camRay.intersectObject(this.collisionRoot, true)) {
        if (isCamIgnored(h.object, self)) continue;
        dist = Math.max(h.distance - CAM_SKIN, CAM_MIN_DIST);
        break; // 1ª superfície bloqueante (hits vêm ordenados por distância)
      }
    }

    this.camera.position.set(
      this.lookTarget.x + this.camBack.x * dist,
      this.lookTarget.y + this.camBack.y * dist,
      this.lookTarget.z + this.camBack.z * dist,
    );
    this.camera.lookAt(this.lookTarget);

    // Occlusion fade: câmera colada (parede/árvore atrás) → oculta o personagem
    // em vez de mostrar o interior da cabeça. Restaura assim que afasta. (O editor
    // também restaura ao abrir — proteção pra pausa com o player oculto.)
    if (self) self.visible = dist > CAM_HIDE_DIST;
  }

  /**
   * Escolhe e toca o clipe de locomoção pelo estado do CharacterBody, com transições
   * contextuais: **correndo + pular** → `run_jump`; **correndo → parar** → `run_stop`
   * (one-shot que segura por {@link RUN_STOP_DUR} antes do idle). Usa esses clipes só
   * se existirem no `.glb` (senão cai no jump/idle normal).
   */
  private drive(obj: THREE.Object3D, horizontalSpeed: number, body: CharacterBodyComponent, dt: number): void {
    const animator = (obj.userData as Record<string, unknown>)['cortexAnim'] as SceneAnimator | undefined;
    if (!animator) return;
    if (!this.clipMap) {
      this.clipMap = autoMapPlayerClips(animator.clipNames());
      this.clipSet = new Set(animator.clipNames());
    }
    const grounded = body.grounded;
    const speed = Math.abs(horizontalSpeed);

    // Ação one-shot do jogo (soco/etc.) tem prioridade: segura o clipe até acabar.
    if (this.actionLock > 0) {
      this.actionLock -= dt;
      if (this.actionClip && this.clipSet?.has(this.actionClip)) {
        if (this.currentClip !== this.actionClip) {
          animator.play(this.actionClip, { loop: false });
          this.currentClip = this.actionClip;
        }
        return;
      }
      this.actionLock = 0; // clipe inexistente → cancela
    }

    // One-shot em andamento (run_stop): segura até acabar; mover/pular interrompe.
    if (this.oneShotLock > 0) {
      if (speed > 0.1 || !grounded) {
        this.oneShotLock = 0;
      } else {
        this.oneShotLock -= dt;
        return;
      }
    }

    let state = deriveLocomotion({ vx: horizontalSpeed, vy: body.velocityY, grounded }, this.runThreshold);
    if (state === 'jump' && this.wasRunning && this.clipSet?.has('run_jump')) {
      state = 'run_jump';
    } else if (state === 'idle' && this.wasRunning && this.clipSet?.has('run_stop')) {
      state = 'run_stop';
      this.oneShotLock = RUN_STOP_DUR;
    }
    // `wasRunning` só atualiza no chão (persiste no ar → o run_jump dura a subida toda).
    if (grounded) this.wasRunning = speed >= this.runThreshold;

    const clip = this.clipMap[state] ?? state;
    if (clip !== this.currentClip) {
      const oneShot = state === 'jump' || state === 'run_jump' || state === 'run_stop';
      animator.play(clip, { loop: !oneShot });
      this.currentClip = clip;
    }
  }
}
