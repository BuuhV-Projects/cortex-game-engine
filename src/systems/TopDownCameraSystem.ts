import { Vector3, type PerspectiveCamera, type OrthographicCamera } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';

/** Opções da {@link TopDownCameraSystem}. */
export interface TopDownCameraOptions {
  /** Distância da câmera ao alvo (altura quando reto). Default `20`. */
  height?: number;
  /**
   * Inclinação a partir do **reto pra baixo**, em radianos: `0` = vista de cima
   * pura (pixel art de fazenda), `>0` = puxa a câmera pra trás (no +Z) dando o
   * ângulo 3/4 estilo Stardew/RPG. Default `0`.
   */
  angle?: number;
  /**
   * Responsividade do follow (maior = mais "grudado"; menor = mais suave).
   * Independente de frame-rate. `0` = instantâneo. Default `8`.
   */
  responsiveness?: number;
  /** Deslocamento do ponto seguido no plano (X, Z). Default `[0, 0]`. */
  offset?: [number, number];
  /** Limites de enquadramento no plano XZ (trava o ponto seguido na região). */
  bounds?: { minX?: number; maxX?: number; minZ?: number; maxZ?: number };
}

const _up = new Vector3();

/**
 * **Câmera top-down (vista de cima)** — pra jogos 2D de fazenda/RPG (estilo
 * Stardew). Segue o alvo (entidade com {@link FollowCameraTargetComponent}) no
 * **plano XZ** (o chão; Y = altura), com a câmera acima olhando pra baixo. Com
 * `angle: 0` é vista de cima pura; aumente o `angle` pra um 3/4 inclinado.
 * Combine com uma câmera **ortográfica** (`Game({ projection: 'orthographic' })`)
 * pra o look pixel art achatado, ou perspectiva pra leve profundidade.
 *
 * O alvo se move no plano XZ (X e Z); a física de plataforma (gravidade no Y)
 * NÃO se aplica a um jogo top-down — use input/movimento próprios no plano.
 *
 * @example
 * const cam = new TopDownCameraSystem(game.camera, { height: 16, angle: 0 })
 * game.world.addSystem(cam)
 * // marque o player como alvo: entity.addComponent(new FollowCameraTargetComponent())
 */
export class TopDownCameraSystem extends System {
  static override requiredComponents = [TransformComponent, FollowCameraTargetComponent];
  override priority = 30; // depois da física/sync (igual à FollowCamera2D)

  private height: number;
  private angle: number;
  private readonly responsiveness: number;
  private readonly offset: [number, number];
  private readonly bounds: NonNullable<TopDownCameraOptions['bounds']>;
  private cx = 0;
  private cz = 0;
  private initialized = false;

  constructor(
    private readonly camera: PerspectiveCamera | OrthographicCamera,
    options: TopDownCameraOptions = {},
  ) {
    super();
    this.height = options.height ?? 20;
    this.angle = options.angle ?? 0;
    this.responsiveness = options.responsiveness ?? 8;
    this.offset = options.offset ?? [0, 0];
    this.bounds = options.bounds ?? {};
  }

  /** Muda a distância/altura da câmera em runtime. */
  setHeight(height: number): void {
    this.height = height;
  }

  /** Muda a inclinação (0 = reto pra baixo) em runtime. */
  setAngle(radians: number): void {
    this.angle = radians;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const target = entities[0];
    if (!target) return;
    const t = target.getComponent(TransformComponent)!;
    const dt = deltaTime / 1000;

    let fx = t.x + this.offset[0];
    let fz = t.z + this.offset[1];
    const b = this.bounds;
    if (b.minX !== undefined) fx = Math.max(fx, b.minX);
    if (b.maxX !== undefined) fx = Math.min(fx, b.maxX);
    if (b.minZ !== undefined) fz = Math.max(fz, b.minZ);
    if (b.maxZ !== undefined) fz = Math.min(fz, b.maxZ);

    if (!this.initialized) {
      this.cx = fx;
      this.cz = fz;
      this.initialized = true;
    } else {
      const a = this.responsiveness <= 0 ? 1 : 1 - Math.exp(-this.responsiveness * dt);
      this.cx += (fx - this.cx) * a;
      this.cz += (fz - this.cz) * a;
    }

    // Câmera acima do alvo, recuada no +Z pelo `angle` (0 = reto pra baixo).
    const cosA = Math.cos(this.angle);
    const sinA = Math.sin(this.angle);
    this.camera.position.set(this.cx, t.y + this.height * cosA, this.cz + this.height * sinA);
    // "up": reto pra baixo é degenerado com (0,1,0) → usa -Z (mundo +Z vira "baixo"
    // na tela). Com inclinação, (0,1,0) padrão.
    if (this.angle < 0.01) _up.set(0, 0, -1);
    else _up.set(0, 1, 0);
    this.camera.up.copy(_up);
    this.camera.lookAt(this.cx, t.y, this.cz);
  }
}
