import { System, type Entity } from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { MeshComponent } from '../components/MeshComponent'

/** Sincroniza posição/rotação do Object3D com o TransformComponent. */
export class MeshSyncSystem extends System {
  static override requiredComponents = [TransformComponent, MeshComponent]
  override priority = 90

  override update(entities: Entity[]): void {
    for (const e of entities) {
      const tr = e.getComponent(TransformComponent)!
      const mc = e.getComponent(MeshComponent)!
      mc.object.position.set(tr.x, tr.y, tr.z)
      mc.object.rotation.set(0, tr.yaw, 0)
    }
  }
}
