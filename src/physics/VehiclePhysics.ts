import * as THREE from 'three';
import { World } from '../ecs/World.js';
import {
  VehicleGravitySystem,
  type VehicleGravityOptions,
} from './VehicleGravitySystem.js';
import {
  VehicleWallCollisionSystem,
  type VehicleWallCollisionOptions,
} from './VehicleWallCollisionSystem.js';

/**
 * Opções do {@link VehiclePhysics}.
 */
export interface VehiclePhysicsOptions {
  /** Opções do sistema de gravidade + ground-snap. */
  gravity?: VehicleGravityOptions;
  /** Opções do sistema de colisão lateral (deslize). */
  wall?: VehicleWallCollisionOptions;
  /**
   * `pauseWhen` compartilhado, aplicado aos dois sistemas (ex.: pausar tudo no
   * modo editor). Um `pauseWhen` específico em `gravity`/`wall` tem precedência.
   */
  pauseWhen?: () => boolean;
}

/**
 * Agrupador da física cinemática de veículo: registra no `World` a gravidade +
 * ground-snap ({@link VehicleGravitySystem}) e a colisão lateral com deslize
 * ({@link VehicleWallCollisionSystem}), contra a mesma mesh de `ground`, com
 * opções compartilhadas.
 *
 * Opera sobre entidades com `TransformComponent` + `KinematicBodyComponent`.
 *
 * @example
 * const physics = new VehiclePhysics(world, track.root, {
 *   gravity: { onFallOff: (e) => respawn(e) },
 *   wall: { halfLength: 2.2, halfWidth: 1.1 },
 *   pauseWhen: () => editor.active,
 * })
 */
export class VehiclePhysics {
  readonly gravity: VehicleGravitySystem;
  readonly wallCollision: VehicleWallCollisionSystem;

  constructor(world: World, ground: THREE.Object3D, options: VehiclePhysicsOptions = {}) {
    const { pauseWhen } = options;
    this.gravity = new VehicleGravitySystem(ground, {
      ...options.gravity,
      pauseWhen: options.gravity?.pauseWhen ?? pauseWhen,
    });
    this.wallCollision = new VehicleWallCollisionSystem(ground, {
      ...options.wall,
      pauseWhen: options.wall?.pauseWhen ?? pauseWhen,
    });
    world.addSystem(this.gravity);
    world.addSystem(this.wallCollision);
  }
}
