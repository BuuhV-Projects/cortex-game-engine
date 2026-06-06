import type { PerspectiveCamera, OrthographicCamera } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';

/** Opções da {@link FollowCamera2DSystem}. */
export interface FollowCamera2DOptions {
  /** Deslocamento do ponto seguido em relação ao alvo (X, Y). Default `[0, 1]`. */
  offset?: [number, number];
  /** Distância da câmera no eixo Z (olha o plano XY de frente). Default `18`. */
  distance?: number;
  /**
   * Responsividade do follow (maior = mais "grudado"; menor = mais suave/lag).
   * Independente de frame-rate. `0` = instantâneo. Default `8`.
   */
  responsiveness?: number;
  /**
   * Roll da câmera no eixo central (Z), em radianos — a "leve rotação" do 2.5D.
   * **Travado em 0 por padrão**; mude com {@link FollowCamera2DSystem.setRoll}
   * pra dar vida (estilo Rayman). Default `0`.
   */
  roll?: number;
  /** Limites de enquadramento: trava o ponto seguido numa região do level. */
  bounds?: { minX?: number; maxX?: number; minY?: number; maxY?: number };
}

/**
 * Câmera de plataforma 2.5D: segue o alvo (entidade com
 * {@link FollowCameraTargetComponent}) no **plano XY** (sobe/desce/lados), com
 * suavização, limites de enquadramento opcionais e um **roll opcional no eixo Z**
 * (travado em 0; o dev liga se quiser). Olha o plano de uma `distance` no Z, o
 * que dá o leve perspectivado característico do 2.5D.
 */
export class FollowCamera2DSystem extends System {
  static override requiredComponents = [TransformComponent, FollowCameraTargetComponent];
  override priority = 30; // depois da física/sync

  private readonly offset: [number, number];
  private readonly distance: number;
  private readonly responsiveness: number;
  private roll: number;
  private readonly bounds: NonNullable<FollowCamera2DOptions['bounds']>;
  private cx = 0;
  private cy = 0;
  private initialized = false;

  constructor(
    private readonly camera: PerspectiveCamera | OrthographicCamera,
    options: FollowCamera2DOptions = {},
  ) {
    super();
    this.offset = options.offset ?? [0, 1];
    this.distance = options.distance ?? 18;
    this.responsiveness = options.responsiveness ?? 8;
    this.roll = options.roll ?? 0;
    this.bounds = options.bounds ?? {};
  }

  /** Muda o roll (Z) da câmera em runtime — o leve giro do 2.5D. */
  setRoll(radians: number): void {
    this.roll = radians;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const target = entities[0];
    if (!target) return;
    const t = target.getComponent(TransformComponent)!;
    const dt = deltaTime / 1000;

    let fx = t.x + this.offset[0];
    let fy = t.y + this.offset[1];
    const b = this.bounds;
    if (b.minX !== undefined) fx = Math.max(fx, b.minX);
    if (b.maxX !== undefined) fx = Math.min(fx, b.maxX);
    if (b.minY !== undefined) fy = Math.max(fy, b.minY);
    if (b.maxY !== undefined) fy = Math.min(fy, b.maxY);

    if (!this.initialized) {
      this.cx = fx;
      this.cy = fy;
      this.initialized = true;
    } else {
      // Lerp independente de frame-rate (exponencial). responsiveness 0 = instant.
      const a = this.responsiveness <= 0 ? 1 : 1 - Math.exp(-this.responsiveness * dt);
      this.cx += (fx - this.cx) * a;
      this.cy += (fy - this.cy) * a;
    }

    this.camera.position.set(this.cx, this.cy, this.distance);
    // Banca a câmera no Z via vetor "up" (roll=0 → up padrão (0,1,0)).
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.camera.lookAt(this.cx, this.cy, 0);
  }
}
