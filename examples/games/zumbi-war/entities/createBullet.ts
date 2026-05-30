import {
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Color,
  Vector3,
  type World,
  type Scene,
} from 'cortex-game-engine'
import { BulletComponent } from '../components/BulletComponent'
import { MeshComponent } from '../components/MeshComponent'
import type { Entity } from 'cortex-game-engine'

const SHARED_GEOMETRY = new SphereGeometry(0.08, 6, 6)
const SHARED_MATERIAL = new MeshBasicMaterial({ color: new Color(0xffe27a) })

/**
 * Cria uma bala pequena que voa em (dirX, 0, dirZ). dirX/dirZ devem ser
 * unitários. Geometria/material são compartilhados pra evitar lixo.
 */
export function createBullet(
  world: World,
  scene: Scene,
  origin: Vector3,
  dirX: number,
  dirZ: number,
  damage: number,
  range: number,
): Entity {
  const mesh = new Mesh(SHARED_GEOMETRY, SHARED_MATERIAL)
  mesh.position.copy(origin)
  scene.add(mesh)

  const speed = 60
  const lifetime = range / speed
  const entity = world.createEntity()
  entity.addComponent(new BulletComponent(dirX, dirZ, speed, damage, lifetime))
  entity.addComponent(new MeshComponent(mesh))
  return entity
}
