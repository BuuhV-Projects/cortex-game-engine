import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { KinematicBodyComponent } from '../components/KinematicBodyComponent.js';

/**
 * Opções do {@link VehicleWallCollisionSystem}.
 */
export interface VehicleWallCollisionOptions {
  /** Meia-distância do centro ao para-choque frontal. Default 2.2. */
  halfLength?: number;
  /** Meia-largura (offset lateral dos 3 raios). Default 1.1. */
  halfWidth?: number;
  /** Altura dos raios (acima do centro). Default 0.4. */
  bumperHeight?: number;
  /** Acima deste cos(ângulo com a vertical) a superfície é "chão" e é ignorada. Default cos(50°). */
  maxFloorCos?: number;
  /**
   * Fração da velocidade horizontal perdida num impacto **frontal** (0..1).
   * Escala com a frontalidade (impacto raspante perde menos). Default 0 =
   * deslize puro, sem perder velocidade.
   */
  wallFriction?: number;
  /** Quando retorna `true`, o sistema é pulado (ex.: modo editor). */
  pauseWhen?: () => boolean;
}

/**
 * Colisão lateral grosseira contra paredes/obstáculos verticais via 3 raycasts
 * (frente-esquerda, frente, frente-direita) na largura do veículo. Filtra
 * "chão" (normal quase vertical) pra sair de rampa não contar como parede.
 *
 * **Desliza, não trava:** ao detectar penetração do para-choque numa parede, o
 * veículo é empurrado pra fora **ao longo da normal** da parede, preservando o
 * movimento **tangente** — então ele raspa e desliza até sair, em vez de parar.
 * A `horizontalSpeed` é mantida por padrão (`wallFriction = 0`).
 *
 * Não é física real (sem Cannon/Rapier) — é um modelo arcade por raycast.
 */
export class VehicleWallCollisionSystem extends System {
  static override requiredComponents = [TransformComponent, KinematicBodyComponent];
  override priority = 2;

  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly normalWorld = new THREE.Vector3();
  private readonly hitNormal = new THREE.Vector3();
  private readonly offsets = [-1, 0, 1] as const;

  private readonly halfLength: number;
  private readonly halfWidth: number;
  private readonly bumperHeight: number;
  private readonly maxFloorCos: number;
  private readonly wallFriction: number;
  private readonly pauseWhen?: () => boolean;

  constructor(
    private readonly ground: THREE.Object3D,
    options: VehicleWallCollisionOptions = {},
  ) {
    super();
    this.halfLength = options.halfLength ?? 2.2;
    this.halfWidth = options.halfWidth ?? 1.1;
    this.bumperHeight = options.bumperHeight ?? 0.4;
    this.maxFloorCos = options.maxFloorCos ?? Math.cos((50 * Math.PI) / 180);
    this.wallFriction = options.wallFriction ?? 0;
    this.pauseWhen = options.pauseWhen;
  }

  override update(entities: Entity[], deltaTime: number): void {
    if (this.pauseWhen?.()) return;
    const dt = deltaTime / 1000;

    for (const entity of entities) {
      const transform = entity.getComponent(TransformComponent)!;
      const body = entity.getComponent(KinematicBodyComponent)!;

      const speed = body.horizontalSpeed;
      if (Math.abs(speed) < 0.01) continue;

      const forwardX = -Math.sin(transform.rotationY);
      const forwardZ = -Math.cos(transform.rotationY);
      const sign = speed > 0 ? 1 : -1;
      this.dir.set(forwardX * sign, 0, forwardZ * sign);

      const rightX = -forwardZ;
      const rightZ = forwardX;

      this.raycaster.far = this.halfLength + Math.abs(speed) * dt + 0.3;

      let nearestDist = Infinity;
      let hasHit = false;

      for (const offset of this.offsets) {
        const ox = rightX * offset * this.halfWidth;
        const oz = rightZ * offset * this.halfWidth;
        this.origin.set(transform.x + ox, transform.y + this.bumperHeight, transform.z + oz);
        this.raycaster.set(this.origin, this.dir);
        const hits = this.raycaster.intersectObject(this.ground, true);
        if (hits.length === 0) continue;

        const hit = hits[0]!;
        const localNormal = hit.face?.normal;
        if (!localNormal) continue;
        // Normal em world space (o ground pode ter rotação/escala).
        this.normalWorld
          .copy(localNormal)
          .transformDirection(hit.object.matrixWorld)
          .normalize();
        if (Math.abs(this.normalWorld.y) > this.maxFloorCos) continue; // é chão

        if (hit.distance < nearestDist) {
          nearestDist = hit.distance;
          hasHit = true;
          this.hitNormal.copy(this.normalWorld);
        }
      }

      if (!hasHit) continue;

      // Penetração do para-choque além da parede, medida ao longo de `dir`.
      const pen = this.halfLength - nearestDist;
      if (pen <= 0) continue; // parede à frente, mas o para-choque ainda não alcançou

      // Normal horizontal (ignora componente vertical) normalizada.
      const nLen = Math.hypot(this.hitNormal.x, this.hitNormal.z);
      if (nLen < 1e-6) continue;
      const nx = this.hitNormal.x / nLen;
      const nz = this.hitNormal.z / nLen;

      // Empurra pra fora SÓ ao longo da normal → preserva a tangente (desliza).
      // Profundidade ao longo da normal = pen * |dir·n| (dir entra na parede → dir·n < 0).
      const dirDotN = this.dir.x * nx + this.dir.z * nz;
      const pushOut = pen * Math.max(-dirDotN, 0);
      transform.x += nx * pushOut;
      transform.z += nz * pushOut;

      // Opcional: perde velocidade proporcional à frontalidade do impacto.
      if (this.wallFriction > 0) {
        body.horizontalSpeed = speed * (1 - this.wallFriction * Math.min(-dirDotN, 1));
      }
    }
  }
}
