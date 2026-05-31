import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { KinematicBodyComponent } from '../components/KinematicBodyComponent.js';

/**
 * Opções do {@link VehicleGravitySystem}.
 */
export interface VehicleGravityOptions {
  /** Aceleração da gravidade em unidades/s² (negativo = pra baixo). Default -25. */
  gravity?: number;
  /** Raio da roda — folga entre o ponto de contato e o centro lógico. Default 0.3. */
  wheelRadius?: number;
  /**
   * Quanto acima do veículo o raycast pra baixo começa. **Pequeno de propósito**
   * (2–3 un): valores grandes fazem o ray subir até pontes/coberturas acima e o
   * veículo é teleportado pra cima delas. Default 3.
   */
  probeAbove?: number;
  /** Abaixo deste Y, considera-se que o veículo caiu do mapa. Default -1000. */
  fallThreshold?: number;
  /** Chamado quando o veículo cai abaixo de `fallThreshold` (ex.: respawn). */
  onFallOff?: (entity: Entity) => void;
  /** Quando retorna `true`, o sistema é pulado (ex.: modo editor). */
  pauseWhen?: () => boolean;
}

/**
 * Gravidade + snap ao chão por raycast para veículos cinemáticos (entidades
 * com `TransformComponent` + `KinematicBodyComponent`).
 *
 *   1. Aplica `gravity` em `body.velocityY`.
 *   2. Integra `transform.y += velocityY * dt`.
 *   3. Raycast pra baixo contra `ground`. Se o veículo está caindo
 *      (`transform.y <= groundY`), gruda no terreno e zera `velocityY`
 *      (aterrissou). Subindo (pulo), ignora o hit — segue balístico.
 *   4. Se cair abaixo de `fallThreshold`, chama `onFallOff`.
 *
 * Faz o veículo acompanhar a altura do relevo. NÃO inclina o chassi na rampa —
 * isso é efeito separado (suspensão), que fica a cargo do jogo.
 */
export class VehicleGravitySystem extends System {
  static override requiredComponents = [TransformComponent, KinematicBodyComponent];
  override priority = 5;

  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);

  private readonly gravity: number;
  private readonly wheelRadius: number;
  private readonly probeAbove: number;
  private readonly fallThreshold: number;
  private readonly onFallOff?: (entity: Entity) => void;
  private readonly pauseWhen?: () => boolean;

  constructor(
    private readonly ground: THREE.Object3D,
    options: VehicleGravityOptions = {},
  ) {
    super();
    this.gravity = options.gravity ?? -25;
    this.wheelRadius = options.wheelRadius ?? 0.3;
    this.probeAbove = options.probeAbove ?? 3;
    this.fallThreshold = options.fallThreshold ?? -1000;
    this.onFallOff = options.onFallOff;
    this.pauseWhen = options.pauseWhen;
  }

  override update(entities: Entity[], deltaTime: number): void {
    if (this.pauseWhen?.()) return;
    const dt = deltaTime / 1000;

    for (const entity of entities) {
      const transform = entity.getComponent(TransformComponent)!;
      const body = entity.getComponent(KinematicBodyComponent)!;

      body.velocityY += this.gravity * dt;
      transform.y += body.velocityY * dt;

      this.origin.set(transform.x, transform.y + this.probeAbove, transform.z);
      this.raycaster.set(this.origin, this.down);
      // `far` adaptativo: cobre o ponto onde o veículo vai parar mesmo caindo
      // em alta velocidade neste frame.
      this.raycaster.far =
        this.probeAbove + this.wheelRadius + Math.abs(body.velocityY) * dt + 2;
      const hits = this.raycaster.intersectObject(this.ground, true);

      if (hits.length > 0) {
        const groundY = hits[0]!.point.y + this.wheelRadius;
        if (transform.y <= groundY) {
          transform.y = groundY;
          if (body.velocityY < 0) body.velocityY = 0;
          body.grounded = true;
        } else {
          body.grounded = false;
        }
      } else {
        body.grounded = false;
      }

      if (transform.y < this.fallThreshold) {
        this.onFallOff?.(entity);
      }
    }
  }
}
