import { Component } from '../ecs/Component.js';
import type { Vehicle } from '../physics/RapierPhysics.js';
import type { GroundAdhesion } from '../physics/GroundAdhesion.js';

/**
 * Um carro da frota do {@link VehicleArcadeSystem} (SPEC-0259).
 *
 * Junto de um `Object3DComponent` (a malha do chassi). O sistema avança o mundo
 * uma vez por passo para todos os carros e escreve a pose do chassi na malha.
 *
 * Quem dirige (o input do jogador, um `ScriptBehavior` de IA) só escreve em
 * `vehicle.setEngineForce/setBrake/setSteering`.
 *
 * @example
 * const vehicle = physics.createVehicle(spec);
 * entity
 *   .addComponent(new Object3DComponent(carMesh))
 *   .addComponent(new ArcadeVehicleComponent(vehicle, new GroundAdhesion(physics, vehicle)));
 */
export class ArcadeVehicleComponent extends Component {
  constructor(
    readonly vehicle: Vehicle,
    /** Aderência arcade. `null` = simulação pura, ainda no passo compartilhado. */
    readonly adhesion: GroundAdhesion | null = null,
  ) {
    super();
  }
}
