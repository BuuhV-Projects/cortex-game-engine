import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { InputManager } from '../core/InputManager.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { EditableTargetComponent } from '../components/EditableTargetComponent.js';
import { KinematicBodyComponent } from '../components/KinematicBodyComponent.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';

/** Pose salva/teleportada: posição + heading (yaw). */
export interface EditorPose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

/**
 * Câmera de voo livre + ações de edição do alvo. Roda em todos os frames; usa
 * `state.active` pra decidir se intervém.
 *
 * Quando ativo: WASD/QE move (Shift = correr), botão direito + mouse rotaciona.
 * Teleporta o alvo (entidade com `EditableTargetComponent`) com T, fazendo snap
 * pro chão via raycast. `focusOn(obj)` enquadra um objeto estilo Blender.
 *
 * Não cuida de persistência — só câmera/navegação/teleporte. Salvar a cena
 * (incluindo a pose do alvo) é responsabilidade do {@link ObjectEditSystem}
 * (uma única tecla) + o jogo.
 *
 * O `yaw`/`pitch` internos são estado de ferramenta (input acumulado), não de
 * simulação.
 */
export class EditorCameraSystem extends System {
  static override requiredComponents = [TransformComponent, EditableTargetComponent];
  override priority = 25;

  private yaw = 0;
  private pitch = -0.3;
  private readonly raycaster = new THREE.Raycaster();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private prevToggle = false;
  private prevTeleport = false;
  private prevView = false;
  /** Modo ativo no frame anterior — pra reagir à troca por QUALQUER fonte (F2/botão/boot). */
  private prevActive: boolean | null = null;

  constructor(
    private readonly state: EditorState,
    /** Câmera de voo livre — manipulada por este sistema. */
    private readonly camera: THREE.PerspectiveCamera,
    /** Câmera do jogo — copiada pra `camera` ao ativar o editor (continuidade visual). */
    private readonly gameCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    private readonly input: InputManager,
    private readonly ground: THREE.Object3D,
    private readonly hud: EditorHud,
    private readonly moveSpeed = 12,
    private readonly runMultiplier = 4,
    private readonly mouseSensitivity = 0.0035,
  ) {
    super();
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    const target = entities[0];
    if (!target) return;

    this.handleToggle(target);

    if (this.state.active) {
      if (!this.state.gizmoDragging) this.flyCamera(dt);
      this.handleTeleport(target);
      this.handleViewThroughCamera();
      this.updateHud();
    }
  }

  /**
   * Tecla `0` (estilo Blender): põe a câmera livre na pose da câmera do jogo —
   * "ver pela câmera". Ignora quando há um input em foco (pra não disparar ao
   * digitar 0 num campo do inspector).
   */
  private handleViewThroughCamera(): void {
    const ae = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    const down = !typing && this.input.isKeyDown('0');
    if (down && !this.prevView) {
      this.camera.position.copy(this.gameCamera.position);
      this.camera.quaternion.copy(this.gameCamera.quaternion);
      this.syncYawPitchFromCamera();
      this.hud.showToast('Visão pela câmera do jogo (0)');
    }
    this.prevView = down;
  }

  private handleToggle(target: Entity): void {
    // F2 alterna o modo (atalho). O botão Play/Stop e o boot também mudam
    // `state.active` — por isso a reação fica no `prevActive` abaixo, p/ rodar
    // independente da fonte da troca.
    const down = this.input.isKeyDown('F2');
    if (down && !this.prevToggle) this.state.active = !this.state.active;
    this.prevToggle = down;

    if (this.state.active === this.prevActive) return;
    const isInitial = this.prevActive === null; // primeira sincronização (boot) — sem toast
    this.prevActive = this.state.active;
    this.hud.setVisible(this.state.active);
    if (this.state.active) {
      // Entrou em EDIÇÃO: posiciona a câmera livre na pose da câmera do jogo.
      this.camera.position.copy(this.gameCamera.position);
      this.camera.quaternion.copy(this.gameCamera.quaternion);
      this.syncYawPitchFromCamera();
      const body = target.getComponent(KinematicBodyComponent);
      if (body) {
        body.horizontalSpeed = 0;
        body.velocityY = 0;
      }
      if (!isInitial) this.hud.showToast('Modo edição — WASD voa, T teleporta · ▶ Play pra jogar');
    } else if (!isInitial) {
      this.hud.showToast('▶ Play');
    }
  }

  private flyCamera(dt: number): void {
    if (this.input.isButtonDown(2)) {
      const delta = this.input.getMouseDelta();
      this.yaw -= delta.x * this.mouseSensitivity;
      this.pitch -= delta.y * this.mouseSensitivity;
      const limit = Math.PI / 2 - 0.05;
      if (this.pitch > limit) this.pitch = limit;
      if (this.pitch < -limit) this.pitch = -limit;
    } else {
      this.input.getMouseDelta();
    }

    this.forward.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.right.crossVectors(this.forward, this.worldUp).normalize();

    // Desacelera perto de superfícies (estilo Blender): raycast à frente; quanto
    // mais perto a superfície, menor o passo (até ~12% da velocidade). Os helpers
    // de luz/câmera têm raycast no-op, então não contam.
    let proximity = 1;
    this.raycaster.set(this.camera.position, this.forward);
    this.raycaster.far = 40;
    const ahead = this.raycaster.intersectObject(this.ground, true);
    this.raycaster.far = Infinity;
    if (ahead.length > 0) proximity = Math.min(1, Math.max(0.12, ahead[0]!.distance / 18));

    const fast = this.input.isKeyDown('Shift');
    const step = this.moveSpeed * (fast ? this.runMultiplier : 1) * dt * proximity;

    if (this.input.isKeyDown('w') || this.input.isKeyDown('W')) this.camera.position.addScaledVector(this.forward, step);
    if (this.input.isKeyDown('s') || this.input.isKeyDown('S')) this.camera.position.addScaledVector(this.forward, -step);
    if (this.input.isKeyDown('a') || this.input.isKeyDown('A')) this.camera.position.addScaledVector(this.right, -step);
    if (this.input.isKeyDown('d') || this.input.isKeyDown('D')) this.camera.position.addScaledVector(this.right, step);
    if (this.input.isKeyDown('e') || this.input.isKeyDown('E')) this.camera.position.y += step;
    if (this.input.isKeyDown('q') || this.input.isKeyDown('Q')) this.camera.position.y -= step;

    this.camera.lookAt(
      this.camera.position.x + this.forward.x,
      this.camera.position.y + this.forward.y,
      this.camera.position.z + this.forward.z,
    );
  }

  private handleTeleport(target: Entity): void {
    const down = this.input.isKeyDown('t') || this.input.isKeyDown('T');
    if (down && !this.prevTeleport) {
      const transform = target.getComponent(TransformComponent)!;
      const groundY = this.raycastGroundAt(this.camera.position.x, this.camera.position.z);
      transform.x = this.camera.position.x;
      transform.y = groundY ?? this.camera.position.y;
      transform.z = this.camera.position.z;
      transform.rotationY = this.yaw;
      const body = target.getComponent(KinematicBodyComponent);
      if (body) {
        body.horizontalSpeed = 0;
        body.velocityY = 0;
      }
      this.hud.showToast(
        `Alvo teleportado pra (${transform.x.toFixed(1)}, ${transform.y.toFixed(1)}, ${transform.z.toFixed(1)})`,
      );
    }
    this.prevTeleport = down;
  }

  private updateHud(): void {
    const p = this.camera.position;
    this.hud.coords.textContent =
      `cam: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  ` +
      `yaw: ${((this.yaw * 180) / Math.PI).toFixed(0)}°  ` +
      `pitch: ${((this.pitch * 180) / Math.PI).toFixed(0)}°`;
  }

  private syncYawPitchFromCamera(): void {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(dir.y);
  }

  /**
   * Enquadra um objeto: posiciona a câmera a uma distância proporcional ao bbox
   * (com margem) preservando a direção de visão atual e atualiza yaw/pitch.
   * Estilo `F` do Blender/Unity.
   */
  focusOn(target: THREE.Object3D): void {
    const bbox = new THREE.Box3().setFromObject(target);
    const center = new THREE.Vector3();
    let maxDim: number;
    if (bbox.isEmpty()) {
      // Sem geometria (câmera, luz, grupo vazio): a bbox é vazia e getCenter daria
      // (0,0,0). Enquadra a POSIÇÃO mundial do objeto com um tamanho default.
      target.getWorldPosition(center);
      maxDim = 2;
    } else {
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      maxDim = Math.max(size.x, size.y, size.z) || 1;
    }

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const distance = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.8;

    const offset = new THREE.Vector3().subVectors(this.camera.position, center);
    if (offset.lengthSq() < 1e-6) {
      offset.set(0.6, 0.5, 1).normalize();
    } else {
      offset.normalize();
    }

    this.camera.position.copy(center).addScaledVector(offset, distance);
    this.camera.lookAt(center);
    this.syncYawPitchFromCamera();
  }

  private raycastGroundAt(x: number, z: number): number | null {
    this.raycaster.set(new THREE.Vector3(x, this.camera.position.y + 500, z), this.down);
    const hits = this.raycaster.intersectObject(this.ground, true);
    if (hits.length === 0) return null;
    return hits[0]!.point.y + 0.5;
  }
}
