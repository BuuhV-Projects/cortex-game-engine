import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { Object3D } from 'three';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { ArcadeVehicleComponent } from '../components/ArcadeVehicleComponent.js';
import type { RapierPhysics } from '../physics/RapierPhysics.js';
import { REST_STEPS, nextRestSteps } from '../physics/VehicleRest.js';

/** Versão que nunca é a atual: força a primeira montagem da lista. */
const NO_VERSION = -1;

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
 * subpassos) DORME e sai da simulação até algo acordá-lo; chassi cinemático
 * só recebe a pose na malha (SPEC-0655). Carro com `poseOwner = 'external'`
 * (SPEC-0687) fica de fora de tudo: quem marcou escreve a malha.
 *
 * Não combine com `RapierPhysicsSystem` no mesmo `RapierPhysics` (os dois
 * avançam o mundo), e passe `stepPhysics: false` ao `VehicleControlSystem` do
 * jogador.
 *
 * @example
 * world.addSystem(new VehicleArcadeSystem(physics));
 */
export class VehicleArcadeSystem extends System {
  override readonly profileLabel = 'VehicleArcadeSystem';
  static override requiredComponents = [Object3DComponent, ArcadeVehicleComponent];
  override priority = 8;

  /**
   * Carros `'physics'` da última query (SPEC-0687) em arrays paralelos: o componente, o `Object3DComponent` (lido a
   * cada quadro: o jogo pode trocar o `.object` sem mudar a estrutura) e a malha em que a pose foi copiada por último.
   */
  private readonly cars: ArcadeVehicleComponent[] = [];
  private readonly holders: Object3DComponent[] = [];
  private readonly objects: Object3D[] = [];
  /** De onde e de qual versão de dono a lista foi montada. */
  private source: Entity[] | null = null;
  private ownerVersion = NO_VERSION;
  private readonly beforeStep = (step: number): void => {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]!;
      const body = car.vehicle.body;
      // Parado dorme (SPEC-0655): sem aderência nem controlador, e fora do passo do mundo.
      // Cinemático ainda 'physics' idem: a pose vem de fora, e ele nunca dorme.
      if (body.isSleeping() || !body.isDynamic()) continue;
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
    this.refresh(entities);
    this.physics.advance(deltaTime / 1000, this.beforeStep);
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]!;
      const body = car.vehicle.body;
      const object = this.holders[i]!.object;
      if (object !== this.objects[i]) {
        // malha trocada pelo jogo: a nova recebe a pose já, mesmo com o carro dormindo
        this.objects[i] = object;
        car.restingPoseCopied = false;
      }
      if (!body.isSleeping()) car.restingPoseCopied = false;
      else if (car.restingPoseCopied) continue; // a pose não muda dormindo
      else car.restingPoseCopied = true; // dormiu neste quadro: copia a pose final uma vez
      const t = body.translation();
      const r = body.rotation();
      object.position.set(t.x, t.y, t.z);
      object.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Remonta a lista dos `'physics'` se a query ou algum dono mudou (SPEC-0687). */
  private refresh(entities: Entity[]): void {
    const version = ArcadeVehicleComponent.poseOwnerVersion;
    if (entities === this.source && version === this.ownerVersion) return;
    this.source = entities;
    this.ownerVersion = version;
    this.cars.length = 0;
    this.holders.length = 0;
    this.objects.length = 0;
    for (const entity of entities) {
      const car = entity.getComponent(ArcadeVehicleComponent)!;
      if (car.poseOwner !== 'physics') continue;
      this.cars.push(car);
      const holder = entity.getComponent(Object3DComponent)!;
      this.holders.push(holder);
      this.objects.push(holder.object);
    }
  }
}
