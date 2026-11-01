import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { ArcadeVehicleComponent } from '../components/ArcadeVehicleComponent.js';
import type { RapierPhysics } from '../physics/RapierPhysics.js';
import { REST_STEPS, nextRestSteps } from '../physics/VehicleRest.js';

/**
 * Avança VÁRIOS carros no mesmo mundo Rapier (ADR-0256 / SPEC-0259).
 *
 * O `VehicleControlSystem` supõe um carro e avança o mundo sozinho; com seis, os
 * da IA davam `vehicle.update` fora do passo do mundo. Aqui o mundo anda UMA vez
 * por passo, e cada carro faz aderência + `update` dentro dele.
 *
 * Prioridade 8 (o slot da física): pilotos — input do jogador (30) e scripts de
 * IA (50) — escrevem forças que valem no passo do frame seguinte, com o mesmo
 * atraso para todos; a câmera (30) vê a pose recém-calculada.
 *
 * Carro parado (sem motor, sem velocidade, rodas no chão por `REST_STEPS`
 * subpassos) DORME e sai da simulação até algo acordá-lo (SPEC-0654).
 *
 * Não combine com `RapierPhysicsSystem` no mesmo `RapierPhysics` (os dois
 * avançam o mundo), e passe `stepPhysics: false` ao `VehicleControlSystem` do
 * jogador.
 *
 * @example
 * world.addSystem(new VehicleArcadeSystem(physics));
 */
export class VehicleArcadeSystem extends System {
  static override requiredComponents = [Object3DComponent, ArcadeVehicleComponent];
  override priority = 8;

  private cars: Entity[] = [];
  private readonly beforeStep = (step: number): void => {
    for (const entity of this.cars) {
      const car = entity.getComponent(ArcadeVehicleComponent)!;
      const body = car.vehicle.body;
      // Parado dorme (SPEC-0654): sem aderência nem controlador, e fora do passo do mundo.
      if (body.isSleeping()) continue;
      car.adhesion?.apply(step);
      car.vehicle.update(step);
      car.restSteps = nextRestSteps(car.restSteps, car.vehicle);
      if (car.restSteps >= REST_STEPS) {
        car.restSteps = 0;
        body.sleep();
      }
    }
  };

  constructor(private readonly physics: RapierPhysics) {
    super();
  }

  override update(entities: Entity[], deltaTime: number): void {
    this.cars = entities;
    this.physics.advance(deltaTime / 1000, this.beforeStep);
    for (const entity of entities) {
      const body = entity.getComponent(ArcadeVehicleComponent)!.vehicle.body;
      if (body.isSleeping()) continue; // a pose não muda dormindo
      const object = entity.getComponent(Object3DComponent)!.object;
      const t = body.translation();
      const r = body.rotation();
      object.position.set(t.x, t.y, t.z);
      object.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
