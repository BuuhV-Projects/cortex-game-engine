import { System, type Entity, MeshStandardMaterial, Mesh, type Object3D } from 'cortex-game-engine'
import { HitFlashComponent } from '../components/HitFlashComponent'
import { MeshComponent } from '../components/MeshComponent'

/**
 * Acende emissive vermelho em todos os MeshStandardMaterial filhos do
 * mesh enquanto HitFlash estiver ativo. Decai pra preto.
 */
export class MeshHitFlashSystem extends System {
  static override requiredComponents = [HitFlashComponent, MeshComponent]

  override update(entities: Entity[]): void {
    for (const entity of entities) {
      const flash = entity.getComponent(HitFlashComponent)!
      const mesh = entity.getComponent(MeshComponent)!.object
      const intensity = Math.max(0, flash.remaining * 10)
      mesh.traverse((obj: Object3D) => {
        if (!(obj instanceof Mesh)) return
        const mat = obj.material
        if (Array.isArray(mat)) return
        if (mat instanceof MeshStandardMaterial) {
          mat.emissive.setRGB(intensity, 0, 0)
        }
      })
    }
  }
}
