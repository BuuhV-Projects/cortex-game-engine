import { System, type Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { CarVisualComponent } from '../components/CarVisualComponent'
import { lerp } from '../utils/math'

const MAX_STEER_ANGLE = 0.55  // ~31°, sensação Mario Kart
const SMOOTH = 14             // 1/s — quanto maior, mais rápido o esterço acompanha

/** Vira as rodas dianteiras conforme o `inputSteer` do carro. */
export class WheelSteerSystem extends System {
  static override requiredComponents = [CarComponent, CarVisualComponent]
  override priority = 91

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000
    const a = Math.min(1, SMOOTH * dt)
    for (const e of entities) {
      const car = e.getComponent(CarComponent)!
      const vis = e.getComponent(CarVisualComponent)!
      const target = car.inputSteer * MAX_STEER_ANGLE
      for (const holder of vis.frontWheels) {
        holder.rotation.y = lerp(holder.rotation.y, target, a)
      }
    }
  }
}
