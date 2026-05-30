import {
  Group, Mesh,
  BoxGeometry, ConeGeometry,
  MeshStandardMaterial,
  type World, type Scene, type Entity,
} from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { MeshComponent } from '../components/MeshComponent'
import { NitroPickupComponent } from '../components/NitroPickupComponent'

/**
 * Cria um pickup de nitro: caixa amarela com seta de boost, flutuando
 * um pouco acima da pista. O giro contínuo é aplicado pelo
 * NitroPickupSystem.
 */
export function createNitroPickup(
  world: World,
  scene: Scene,
  x: number, y: number, z: number,
): Entity {
  const group = new Group()

  const box = new Mesh(
    new BoxGeometry(1.0, 1.0, 1.0),
    new MeshStandardMaterial({
      color: 0xffd23f,
      emissive: 0xb88a00,
      roughness: 0.4,
      metalness: 0.6,
    }),
  )
  group.add(box)

  const arrow = new Mesh(
    new ConeGeometry(0.35, 0.7, 16),
    new MeshStandardMaterial({ color: 0xff6b00, emissive: 0x803000 }),
  )
  arrow.rotation.z = -Math.PI / 2  // seta apontando "pra frente" no eixo X
  arrow.position.x = 0.45
  group.add(arrow)

  group.position.set(x, y + 1.2, z)
  scene.add(group)

  const entity = world.createEntity()
  entity.addComponent(new TransformComponent(x, y + 1.2, z))
  entity.addComponent(new MeshComponent(group))
  entity.addComponent(new NitroPickupComponent())
  return entity
}
