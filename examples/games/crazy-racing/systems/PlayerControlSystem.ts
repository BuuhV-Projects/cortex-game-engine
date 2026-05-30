import { System, type Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { PlayerInputComponent } from '../components/PlayerInputComponent'

/**
 * Copia o input do jogador para os campos de entrada do CarComponent.
 *
 * Steer é invertido em relação ao input bruto: a câmera segue o carro
 * por trás olhando +Z, e nessa orientação o eixo "direita" da câmera
 * fica em -X mundial. Sem essa inversão, A/D (e setas ←/→) parecem
 * trocados pro jogador. A AI não passa por aqui — ela calcula o steer
 * direto a partir do ângulo absoluto, então permanece correta.
 */
export class PlayerControlSystem extends System {
  static override requiredComponents = [CarComponent, PlayerInputComponent]
  override priority = 10

  override update(entities: Entity[]): void {
    for (const e of entities) {
      const car = e.getComponent(CarComponent)!
      const pi = e.getComponent(PlayerInputComponent)!
      car.inputThrottle = pi.throttle
      car.inputBrake    = pi.brake
      car.inputSteer    = -pi.steer
    }
  }
}
