import { System, type Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { TransformComponent } from '../components/TransformComponent'

/**
 * Colisão círculo-círculo no plano XZ entre todos os carros.
 *
 * Pra cada par (i, j) com distância < 2*RADIUS: separa cada um por
 * `overlap/2` no eixo da colisão e aplica perda de velocidade
 * proporcional à componente do "vetor frente" alinhada à normal de
 * contato — quem bate de frente perde mais que quem só raspa.
 *
 * O(n²) em N carros, mas N=5–6, então é trivial.
 */
export class CarCollisionSystem extends System {
  static override requiredComponents = [CarComponent, TransformComponent]
  override priority = 24   // depois de CarPhysics (20), antes de CarRescue (25)

  override update(entities: Entity[]): void {
    const RADIUS = 1.3
    const MIN_DIST = RADIUS * 2

    for (let i = 0; i < entities.length; i++) {
      const trA = entities[i].getComponent(TransformComponent)!
      const carA = entities[i].getComponent(CarComponent)!
      for (let j = i + 1; j < entities.length; j++) {
        const trB = entities[j].getComponent(TransformComponent)!
        const carB = entities[j].getComponent(CarComponent)!

        // Ignora se estão em alturas muito diferentes (viaduto)
        if (Math.abs(trA.y - trB.y) > 2.0) continue

        const dx = trB.x - trA.x
        const dz = trB.z - trA.z
        const distSq = dx * dx + dz * dz
        if (distSq >= MIN_DIST * MIN_DIST) continue

        const dist = Math.sqrt(distSq) || 0.0001
        const nx = dx / dist
        const nz = dz / dist
        const overlap = MIN_DIST - dist

        // Separa cada carro por metade do overlap (pequena folga pra
        // evitar disparos repetidos por flutuação de ponto flutuante)
        const push = overlap / 2 + 0.01
        trA.x -= nx * push
        trA.z -= nz * push
        trB.x += nx * push
        trB.z += nz * push

        // Perda de velocidade — projeta o vetor frente de cada carro na
        // normal pra saber quem está "atacando".
        const fxA = Math.sin(trA.yaw), fzA = Math.cos(trA.yaw)
        const fxB = Math.sin(trB.yaw), fzB = Math.cos(trB.yaw)
        const dotA =  fxA * nx + fzA * nz   // >0: A indo em direção a B
        const dotB = -fxB * nx - fzB * nz   // >0: B indo em direção a A

        if (dotA > 0) carA.speed *= Math.max(0.45, 1 - 0.5 * dotA)
        if (dotB > 0) carB.speed *= Math.max(0.45, 1 - 0.5 * dotB)
      }
    }
  }
}
