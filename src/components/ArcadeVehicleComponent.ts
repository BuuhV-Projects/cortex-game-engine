import { Component } from '../ecs/Component.js';
import type { Vehicle } from '../physics/RapierPhysics.js';
import type { GroundAdhesion } from '../physics/GroundAdhesion.js';

/**
 * Quem escreve a pose da malha do carro (SPEC-0687).
 *
 * - `'physics'`: o {@link VehicleArcadeSystem} roda aderência e controlador e copia a pose do corpo para a malha.
 * - `'external'`: o sistema não toca o carro (nem lê o corpo); quem marcou escreve a malha, como o trânsito no
 *   trilho, que já sabe a pose que deu ao corpo cinemático.
 */
export type VehiclePoseOwner = 'physics' | 'external';

/** Sobe a cada troca de dono de qualquer carro: o sistema refaz a lista dos simulados (SPEC-0687). */
let poseOwnerVersion = 0;

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
 *
 * // trilho cinemático: o jogo escreve a malha e o sistema pula o carro (SPEC-0687)
 * component.poseOwner = 'external';
 */
export class ArcadeVehicleComponent extends Component {
  /** Subpassos seguidos em repouso; ao chegar em `REST_STEPS` o chassi dorme (SPEC-0655). */
  restSteps = 0;
  /** Dormindo, a pose final já foi copiada para a malha (SPEC-0655/0687): não copia de novo até acordar. */
  restingPoseCopied = false;
  private owner: VehiclePoseOwner = 'physics';

  /** Versão das trocas de {@link ArcadeVehicleComponent.poseOwner} de todos os carros (SPEC-0687). */
  static get poseOwnerVersion(): number {
    return poseOwnerVersion;
  }

  constructor(
    readonly vehicle: Vehicle,
    /** Aderência arcade. `null` = simulação pura, ainda no passo compartilhado. */
    readonly adhesion: GroundAdhesion | null = null,
  ) {
    super();
  }

  /**
   * Quem escreve a pose da malha (SPEC-0687; padrão `'physics'`). Voltar para `'physics'` copia a pose do corpo
   * já no próximo `update`, mesmo dormindo. Use `'external'` para corpo cinemático ou congelado: dinâmico marcado
   * assim continua no Rapier, mas sem controlador e sem a malha seguir.
   */
  get poseOwner(): VehiclePoseOwner {
    return this.owner;
  }

  set poseOwner(owner: VehiclePoseOwner) {
    if (owner === this.owner) return;
    this.owner = owner;
    this.restingPoseCopied = false;
    poseOwnerVersion++;
  }
}
