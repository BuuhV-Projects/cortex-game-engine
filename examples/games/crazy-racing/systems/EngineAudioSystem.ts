import { System, type Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { TransformComponent } from '../components/TransformComponent'
import { EngineSoundComponent } from '../components/EngineSoundComponent'

/**
 * Atualiza pitch/volume/posição do som de motor de cada carro.
 * Roda depois do MeshSync e do CameraFollow.
 */
export class EngineAudioSystem extends System {
  static override requiredComponents = [CarComponent, TransformComponent, EngineSoundComponent]
  override priority = 96

  override update(entities: Entity[]): void {
    for (const e of entities) {
      const car = e.getComponent(CarComponent)!
      const tr  = e.getComponent(TransformComponent)!
      const es  = e.getComponent(EngineSoundComponent)!
      es.audio.setSpeed(car.speed, car.maxSpeed, car.inputThrottle)
      es.audio.setPosition(tr.x, tr.y, tr.z)
    }
  }
}
