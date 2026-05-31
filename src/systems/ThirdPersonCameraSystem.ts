import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';

/**
 * Opções do {@link ThirdPersonCameraSystem}.
 */
export interface ThirdPersonCameraOptions {
  /** Distância atrás do alvo (no eixo do heading). Default 5.5. */
  behind?: number;
  /** Altura acima do alvo. Default 2.2. */
  height?: number;
  /** Distância à frente do alvo pra onde a câmera olha. Default 10. */
  lookAhead?: number;
  /** Fator do lerp exponencial — menor = mais "preguiçosa"/suave. Default 9. */
  smoothness?: number;
  /** Quando retorna `true`, o sistema é pulado (ex.: modo editor). */
  pauseWhen?: () => boolean;
}

/**
 * Câmera de perseguição (terceira pessoa) estilo arcade: fica atrás e acima do
 * alvo (offset rotacionado pelo `rotationY`) e olha levemente à frente dele,
 * com interpolação exponencial pra suavizar.
 *
 * Segue a entidade que tiver `TransformComponent` + `FollowCameraTargetComponent`
 * (espera no máximo uma). Serve qualquer entidade, não só veículos.
 */
export class ThirdPersonCameraSystem extends System {
  static override requiredComponents = [TransformComponent, FollowCameraTargetComponent];
  override priority = 20;

  private readonly desired = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

  private readonly behind: number;
  private readonly height: number;
  private readonly lookAhead: number;
  private readonly smoothness: number;
  private readonly pauseWhen?: () => boolean;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    options: ThirdPersonCameraOptions = {},
  ) {
    super();
    this.behind = options.behind ?? 5.5;
    this.height = options.height ?? 2.2;
    this.lookAhead = options.lookAhead ?? 10;
    this.smoothness = options.smoothness ?? 9;
    this.pauseWhen = options.pauseWhen;
  }

  override update(entities: Entity[], deltaTime: number): void {
    if (this.pauseWhen?.()) return;
    const target = entities[0];
    if (!target) return;

    const transform = target.getComponent(TransformComponent)!;
    const dt = deltaTime / 1000;
    const t = 1 - Math.exp(-this.smoothness * dt);

    const sin = Math.sin(transform.rotationY);
    const cos = Math.cos(transform.rotationY);

    this.desired.set(
      transform.x + sin * this.behind,
      transform.y + this.height,
      transform.z + cos * this.behind,
    );
    this.camera.position.lerp(this.desired, t);

    this.lookTarget.set(
      transform.x - sin * this.lookAhead,
      transform.y + 0.6,
      transform.z - cos * this.lookAhead,
    );
    this.camera.lookAt(this.lookTarget);
  }
}
