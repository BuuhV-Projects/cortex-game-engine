import {
  Group,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  TorusGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  type World,
  type Scene,
  type Entity,
} from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { MeshComponent } from '../components/MeshComponent'
import { CarComponent } from '../components/CarComponent'
import { CarVisualComponent } from '../components/CarVisualComponent'
import type { PlayerCustomization, CarModel } from '../utils/constants'

export interface CarMeshBuild {
  root: Group
  /** Wrappers das 2 rodas dianteiras — rotation.y é o ângulo de direção. */
  frontWheels: Group[]
}

/**
 * Monta um Group representando o carro com chassi + 4 rodas customizáveis.
 * O Group fica na origem (0,0,0) — TransformComponent + MeshSyncSystem
 * cuidam de posicionar/rotacionar a cada frame.
 *
 * Cada roda é envolvida num Group wrapper (`wheelHolder`) posicionado no
 * carro; a Mesh do cilindro/torus fica dentro com a sua rotação Z=π/2 que
 * a deita. Isso isola a rotação Y do wrapper (direção) da rotação Z da
 * Mesh (orientação do cilindro), evitando conflito de eixos Euler.
 */
export function buildCarMesh(c: PlayerCustomization): CarMeshBuild {
  const group = new Group()

  group.add(buildChassi(c.carModel, c.color))
  group.add(buildCabin(c.carModel, c.color))

  const wheelSize = 0.4 * c.wheelSize
  const wheelOffsets: Array<[number, number, boolean]> = [
    [ 0.7,  1.0, true ],
    [-0.7,  1.0, true ],
    [ 0.7, -1.0, false],
    [-0.7, -1.0, false],
  ]
  const frontWheels: Group[] = []
  for (const [dx, dz, isFront] of wheelOffsets) {
    const wheelMesh = buildWheel(c.wheelType, wheelSize)
    const holder = new Group()
    holder.position.set(dx, wheelSize * 0.5, dz)
    holder.add(wheelMesh)
    group.add(holder)
    if (isFront) frontWheels.push(holder)
  }
  return { root: group, frontWheels }
}

function buildChassi(model: CarModel, color: number): Mesh {
  let geo: BoxGeometry
  switch (model) {
    case 'buggy': geo = new BoxGeometry(1.6, 0.5, 2.6); break
    case 'racer': geo = new BoxGeometry(1.3, 0.35, 3.0); break
    default:      geo = new BoxGeometry(1.5, 0.4, 2.4); break
  }
  const mat = new MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
  const mesh = new Mesh(geo, mat)
  mesh.position.y = 0.55
  return mesh
}

function buildCabin(model: CarModel, color: number): Mesh {
  if (model === 'racer') {
    const geo = new SphereGeometry(0.45, 12, 10)
    const mat = new MeshStandardMaterial({ color: darken(color, 0.4), roughness: 0.3 })
    const m = new Mesh(geo, mat)
    m.position.set(0, 0.95, -0.2)
    m.scale.set(1, 0.7, 1.2)
    return m
  }
  const geo = new BoxGeometry(1.1, 0.5, 1.0)
  const mat = new MeshStandardMaterial({ color: darken(color, 0.45), roughness: 0.4 })
  const m = new Mesh(geo, mat)
  m.position.set(0, 1.0, model === 'buggy' ? -0.1 : 0.05)
  return m
}

function buildWheel(type: PlayerCustomization['wheelType'], size: number): Mesh {
  let geo
  let mat
  switch (type) {
    case 'offroad':
      geo = new TorusGeometry(size, size * 0.5, 8, 12)
      mat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
      break
    case 'sport':
      geo = new CylinderGeometry(size, size, size * 0.4, 16)
      mat = new MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.2 })
      break
    default:
      geo = new CylinderGeometry(size, size, size * 0.5, 12)
      mat = new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })
      break
  }
  const mesh = new Mesh(geo, mat)
  mesh.rotation.z = Math.PI / 2
  return mesh
}

function darken(hex: number, amount: number): number {
  const r = ((hex >> 16) & 0xff) * (1 - amount)
  const g = ((hex >> 8) & 0xff) * (1 - amount)
  const b = (hex & 0xff) * (1 - amount)
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

export interface SpawnCarOptions {
  x: number
  z: number
  yaw: number
  customization: PlayerCustomization
  cup: { maxSpeed: number; accel: number; aiSpeedMul: number }
  isAI?: boolean
}

export function createCar(
  world: World,
  scene: Scene,
  opts: SpawnCarOptions,
): Entity {
  const { root, frontWheels } = buildCarMesh(opts.customization)
  scene.add(root)

  const entity = world.createEntity()
  entity.addComponent(new TransformComponent(opts.x, 0, opts.z, opts.yaw))
  entity.addComponent(new MeshComponent(root))
  entity.addComponent(new CarVisualComponent(frontWheels))

  const car = new CarComponent(opts.customization)
  car.maxSpeed = opts.cup.maxSpeed * (opts.isAI ? opts.cup.aiSpeedMul : 1)
  car.accel = opts.cup.accel * (opts.isAI ? opts.cup.aiSpeedMul : 1)
  entity.addComponent(car)

  return entity
}
