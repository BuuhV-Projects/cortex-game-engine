import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import type { InputManager } from '../core/InputManager.js';

/** Opções do {@link FirstPersonCameraSystem}. */
export interface FirstPersonCameraOptions {
  /** Velocidade de caminhada no plano (unidades/s). Default `6`. */
  moveSpeed?: number;
  /** Altura dos olhos acima dos **pés** do personagem. Default `1.6`. */
  eyeHeight?: number;
  /** Sensibilidade do mouse (rad por pixel de movimento). Default `0.0022`. */
  sensitivity?: number;
  /**
   * Predicado de **pausa** (ex.: `() => game.editorActive`). Quando `true`, o
   * sistema não move/olha (e **mostra** o mesh do player pra editar). Diferente do
   * `System.pauseWhen` (que o World usa pra PULAR o update): aqui o update **sempre
   * roda** pra poder restaurar a visibilidade do corpo ao voltar pro editor.
   */
  pauseWhen?: () => boolean;
}

/** Limite do pitch (olhar p/ cima/baixo) — ~85°, evita virar de cabeça pra baixo. */
const PITCH_LIMIT = Math.PI / 2 - 0.08;

/**
 * Câmera + controle de **primeira pessoa** (FPS). Mira o único {@link Entity} com
 * {@link TransformComponent} + {@link CharacterBodyComponent} (o player cápsula) e:
 *
 * - **Mouse-look** (com *pointer lock*): mover o mouse gira a visão — yaw em torno
 *   do Y, pitch em torno do X (clampado). O cursor trava ao **clicar no canvas**.
 * - **Andar** (WASD/setas): no plano XZ relativo a pra onde se olha (frente/trás +
 *   strafe); escreve a posição e a `rotationY` no transform. A física vertical
 *   (gravidade/pulo/aterrar no terreno) fica com o {@link CharacterBodyComponent} +
 *   `CharacterPhysicsSystem`.
 * - **Pular**: Espaço (na borda de pressão) chama `characterBody.jump()`.
 * - **Câmera**: posicionada na **altura dos olhos** (pés + `eyeHeight`), olhando na
 *   direção (yaw, pitch). Como a câmera fica DENTRO do corpo, o **mesh do player é
 *   escondido enquanto joga** (senão a câmera vê o interior da cápsula) e mostrado
 *   no editor (pra dar pra selecionar/editar o nó).
 *
 * Roda em `priority = 20` (depois da física, priority 5) pra usar o Y já integrado.
 * Estado de yaw/pitch é interno (single-player). Pra outro esquema de input
 * (gamepad/touch), escreva direto no transform/`CharacterBody`.
 *
 * @example
 * // tipicamente via setupFirstPerson(game), mas dá pra montar à mão:
 * const fps = new FirstPersonCameraSystem(game.camera, game.input, game.canvas, {
 *   moveSpeed: 6,
 *   pauseWhen: () => game.editorActive,
 * })
 * game.world.addSystem(fps)
 */
export class FirstPersonCameraSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 20;

  private readonly moveSpeed: number;
  private readonly eyeHeight: number;
  private readonly sensitivity: number;
  /** Pausa interna (NÃO é o `System.pauseWhen` — ver {@link FirstPersonCameraOptions.pauseWhen}). */
  private readonly shouldPause?: () => boolean;

  /** Ângulo horizontal (rad). `0` = olhando pra −Z. */
  private yaw = 0;
  /** Ângulo vertical (rad). `0` = horizonte; positivo = pra cima. */
  private pitch = 0;
  private prevJump = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly canvas: HTMLElement,
    options: FirstPersonCameraOptions = {},
  ) {
    super();
    this.moveSpeed = options.moveSpeed ?? 6;
    this.eyeHeight = options.eyeHeight ?? 1.6;
    this.sensitivity = options.sensitivity ?? 0.0022;
    this.shouldPause = options.pauseWhen;

    // Trava o cursor ao clicar no canvas (só no jogo — não enquanto o editor/pause
    // está ativo, pra não roubar o mouse de quem está editando no F2).
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

    // Em 1ª pessoa a câmera fica DENTRO do corpo: esconde o mesh do player enquanto
    // JOGA (senão a câmera vê o interior da cápsula vermelha) e MOSTRA quando pausado
    // (editor/pause) pra dar pra selecionar/editar o nó. `paused` = editor/pause ativo,
    // então `visible = paused`. O update SEMPRE roda (pausa interna, não via
    // System.pauseWhen) pra conseguir RESTAURAR a visibilidade ao voltar pro editor.
    const paused = this.shouldPause?.() ?? false;
    if (obj) obj.visible = paused;
    if (paused) return;

    const dt = deltaTime / 1000;

    // ── Mouse-look (só com pointer lock, senão consome o delta sem girar) ──────
    const md = this.input.getMouseDelta();
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
      this.yaw -= md.x * this.sensitivity;
      this.pitch -= md.y * this.sensitivity;
      if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
      if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
    }

    // ── Posiciona a câmera ANTES de aplicar o movimento deste frame ───────────
    // A câmera usa a posição JÁ corrigida pela física (gravidade/chão/parede rodam
    // em priority 5, antes daqui). Posicionar antes de mover o player evita mostrar
    // a câmera "dentro" da parede por 1 frame (a depenetração de parede do
    // CharacterPhysicsSystem corrige a penetração do frame anterior). Custo: ~16ms
    // de lag visual imperceptível. Ver CharacterPhysicsSystem (colisão de parede).
    this.camera.position.set(t.x, t.y + this.eyeHeight, t.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // ── Caminhada no plano XZ, relativa ao yaw ────────────────────────────────
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Frente (pra onde olha, projetada no chão) e direita (strafe).
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;
    let mx = 0, mz = 0;
    const k = this.input;
    if (k.isKeyDown('w') || k.isKeyDown('ArrowUp')) { mx += fx; mz += fz; }
    if (k.isKeyDown('s') || k.isKeyDown('ArrowDown')) { mx -= fx; mz -= fz; }
    if (k.isKeyDown('d') || k.isKeyDown('ArrowRight')) { mx += rx; mz += rz; }
    if (k.isKeyDown('a') || k.isKeyDown('ArrowLeft')) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const step = (this.moveSpeed * dt) / len;
      t.x += mx * step;
      t.z += mz * step;
    }
    t.rotationY = this.yaw;

    // ── Pulo (borda de pressão) ───────────────────────────────────────────────
    const jumpDown = k.isKeyDown(' ');
    if (jumpDown && !this.prevJump) body.jump();
    this.prevJump = jumpDown;
  }
}
