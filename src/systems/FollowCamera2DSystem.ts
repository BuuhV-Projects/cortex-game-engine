import type { PerspectiveCamera, OrthographicCamera } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';

/** Yaw isométrico clássico (45° em torno do Y vertical). */
export const ISOMETRIC_YAW = Math.PI / 4;
/** Pitch isométrico clássico (`atan(1/√2)` ≈ 35.264°). */
export const ISOMETRIC_PITCH = Math.atan(1 / Math.SQRT2);

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
  /**
   * Pitch da câmera (inclinação no eixo X), em radianos — tilta a câmera pra
   * olhar o plano XY de cima/baixo num ângulo, dando **profundidade/parallax**
   * (o fundo em Z<0 desce, o primeiro plano em Z>0 sobe). Positivo = olhar de
   * cima pra baixo. **Travado em 0 por padrão** (olha reto); mude com
   * {@link FollowCamera2DSystem.setPitch}. Default `0`.
   */
  pitch?: number;
  /**
   * Yaw da câmera (giro em torno do eixo **Y vertical**), em radianos — orbita o
   * ponto seguido na horizontal, mostrando profundidade pela lateral. Combinado
   * com `pitch`, dá o ângulo 3/4 **isométrico** (vista de diorama). **Travado em
   * 0 por padrão** (olha o plano XY de frente); mude com
   * {@link FollowCamera2DSystem.setYaw}. Default `0`.
   */
  yaw?: number;
  /**
   * Atalho: liga o **preset isométrico** (yaw 45° + pitch ≈35.264°). `yaw`/`pitch`
   * explícitos têm precedência. Use uma câmera **ortográfica** pra isometria
   * verdadeira (linhas paralelas) ou **perspectiva** pra "perspectiva isométrica"
   * (leve convergência). Default `false`.
   */
  isometric?: boolean;
  /** Limites de enquadramento: trava o ponto seguido numa região do level. */
  bounds?: { minX?: number; maxX?: number; minY?: number; maxY?: number };
}

/**
 * Câmera de plataforma 2.5D: segue o alvo (entidade com
 * {@link FollowCameraTargetComponent}) no **plano XY** (sobe/desce/lados), com
 * suavização, limites de enquadramento opcionais, um **roll opcional no eixo Z**
 * e um **pitch opcional no eixo X** (ambos travados em 0; o dev liga se quiser).
 * Olha o plano de uma `distance` no Z, o que dá o leve perspectivado
 * característico do 2.5D — o `pitch` reforça a profundidade/parallax.
 */
export class FollowCamera2DSystem extends System {
  static override requiredComponents = [TransformComponent, FollowCameraTargetComponent];
  override priority = 30; // depois da física/sync

  private readonly offset: [number, number];
  private readonly distance: number;
  private readonly responsiveness: number;
  private roll: number;
  private pitch: number;
  private yaw: number;
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
    const iso = options.isometric ?? false;
    this.pitch = options.pitch ?? (iso ? ISOMETRIC_PITCH : 0);
    this.yaw = options.yaw ?? (iso ? ISOMETRIC_YAW : 0);
    this.bounds = options.bounds ?? {};
  }

  /** Muda o roll (Z) da câmera em runtime — o leve giro do 2.5D. */
  setRoll(radians: number): void {
    this.roll = radians;
  }

  /** Roll (Z) atual da câmera, em radianos. */
  getRoll(): number {
    return this.roll;
  }

  /** Muda o pitch (X) da câmera em runtime — tilt pra profundidade/parallax. */
  setPitch(radians: number): void {
    this.pitch = radians;
  }

  /** Pitch (X) atual da câmera, em radianos. */
  getPitch(): number {
    return this.pitch;
  }

  /** Muda o yaw (Y vertical) da câmera em runtime — o giro 3/4 isométrico. */
  setYaw(radians: number): void {
    this.yaw = radians;
  }

  /** Yaw (Y) atual da câmera, em radianos. */
  getYaw(): number {
    return this.yaw;
  }

  /**
   * Aplica o **preset isométrico** (yaw 45° + pitch ≈35.264°). Sem args usa o
   * ângulo iso clássico; passe overrides em radianos pra ajustar. Combine com uma
   * câmera ortográfica pra isometria verdadeira, ou perspectiva pra "perspectiva
   * isométrica".
   */
  setIsometric(yaw: number = ISOMETRIC_YAW, pitch: number = ISOMETRIC_PITCH): void {
    this.yaw = yaw;
    this.pitch = pitch;
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

    // Orbita a câmera em torno do ponto seguido por pitch (X) + yaw (Y vertical).
    // pitch=0,yaw=0 → reto em (cx, cy, distance); pitch>0 sobe em Y (parallax);
    // yaw≠0 gira na horizontal. pitch+yaw juntos = ângulo 3/4 isométrico.
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const horiz = this.distance * cosP; // raio no plano horizontal (XZ)
    this.camera.position.set(
      this.cx + horiz * Math.sin(this.yaw),
      this.cy + this.distance * sinP,
      horiz * Math.cos(this.yaw),
    );
    // Banca a câmera no Z via vetor "up" (roll=0 → up padrão (0,1,0)).
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.camera.lookAt(this.cx, this.cy, 0);
  }
}
