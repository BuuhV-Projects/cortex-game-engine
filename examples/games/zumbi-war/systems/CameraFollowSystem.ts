import { System, type Entity, Vector3 } from 'cortex-game-engine'
import type { PerspectiveCamera } from 'cortex-game-engine'
import { PlayerComponent } from '../components/PlayerComponent'
import { MeshComponent } from '../components/MeshComponent'

/**
 * Câmera 3ª pessoa por cima do ombro, com ângulo fixo. O input do
 * jogador não controla pitch — só yaw (rotação do player). Framing
 * estável calibrado pra mostrar bem o entorno do soldado.
 *
 * Posição suavizada com lerp exponencial pra movimento fluido.
 */
export class CameraFollowSystem extends System {
  static override requiredComponents = [PlayerComponent, MeshComponent]

  private smoothPos = new Vector3()
  private firstFrame = true

  constructor(
    private camera: PerspectiveCamera,
    private distance = 5,
    private height = 3.5,
    private lookAhead = 6,
    /** Quanto abaixo do horizonte a câmera olha (radianos). Pequeno
     * valor positivo dá sensação de "olhar pra frente e um pouco pra
     * baixo" — como o ângulo da screenshot. */
    private pitchDown = 0.18,
  ) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    if (entities.length === 0) return
    const dt = deltaTime / 1000
    const e = entities[0]!
    const mesh = e.getComponent(MeshComponent)!.object

    const yaw = mesh.rotation.y
    const behindX = Math.sin(yaw) * this.distance
    const behindZ = Math.cos(yaw) * this.distance

    const targetX = mesh.position.x + behindX
    const targetZ = mesh.position.z + behindZ
    const targetY = mesh.position.y + this.height

    if (this.firstFrame) {
      this.smoothPos.set(targetX, targetY, targetZ)
      this.firstFrame = false
    } else {
      const k = 1 - Math.exp(-10 * dt)
      this.smoothPos.x += (targetX - this.smoothPos.x) * k
      this.smoothPos.y += (targetY - this.smoothPos.y) * k
      this.smoothPos.z += (targetZ - this.smoothPos.z) * k
    }

    this.camera.position.copy(this.smoothPos)

    // Ponto que a câmera olha: à frente do player, ligeiramente
    // abaixo do nível dos olhos pra dar a sensação de olhar pra
    // frente com a cabeça um pouco baixa.
    const sinP = Math.sin(this.pitchDown)
    const cosP = Math.cos(this.pitchDown)
    this.camera.lookAt(
      mesh.position.x - Math.sin(yaw) * this.lookAhead * cosP,
      mesh.position.y + 1.6 - sinP * this.lookAhead,
      mesh.position.z - Math.cos(yaw) * this.lookAhead * cosP,
    )
  }
}
