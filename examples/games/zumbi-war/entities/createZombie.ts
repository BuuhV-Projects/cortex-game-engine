import {
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
  type AnimationClip,
  type World,
  type Scene,
  type Object3D,
} from 'cortex-game-engine'
import { ZombieComponent } from '../components/ZombieComponent'
import { VelocityComponent } from '../components/VelocityComponent'
import { HealthComponent } from '../components/HealthComponent'
import { MeshComponent } from '../components/MeshComponent'
import { AnimationComponent } from '../components/AnimationComponent'
import { cloneSkinned } from '../utils/cloneSkinned'
import { buildAnimations, LOOP_ONCE } from '../utils/characterAnims'
import type { Entity } from 'cortex-game-engine'

export interface ZombieAssets {
  template: Group
  clips: {
    idle?: AnimationClip
    walk?: AnimationClip
    run?: AnimationClip
    attack?: AnimationClip
    death?: AnimationClip
  }
}

/**
 * Cria um zumbi clonando o template FBX e instanciando um mixer próprio
 * (mixers não podem ser compartilhados entre instâncias).
 *
 * Tinta os materiais com tom verde-acinzentado pra zombificar visualmente.
 */
export function createZombie(
  world: World,
  scene: Scene,
  assets: ZombieAssets | null,
  x: number,
  z: number,
  speed: number,
): Entity {
  const root = new Group()
  root.position.set(x, 0, z)

  let anim: AnimationComponent | null = null

  if (assets) {
    const inst = cloneSkinned(assets.template) as Group
    inst.scale.setScalar(0.012)
    // FBX Mixamo vem olhando +Z; convenção do jogo é forward = -Z.
    inst.rotation.y = Math.PI
    inst.traverse((obj: Object3D) => {
      if (obj instanceof Mesh) {
        const mat = obj.material
        if (mat instanceof MeshStandardMaterial) {
          const cloned = mat.clone()
          cloned.color = new Color(cloned.color).multiplyScalar(0.5).lerp(new Color(0x4d5a3a), 0.5)
          obj.material = cloned
        } else if (Array.isArray(mat)) {
          obj.material = mat.map((m) => {
            if (m instanceof MeshStandardMaterial) {
              const c = m.clone()
              c.color = new Color(c.color).multiplyScalar(0.5).lerp(new Color(0x4d5a3a), 0.5)
              return c
            }
            return m
          })
        }
      }
    })
    root.add(inst)

    const { mixer, actions } = buildAnimations(inst, assets.clips)
    if (actions.death) {
      actions.death.setLoop(LOOP_ONCE, 1)
      actions.death.clampWhenFinished = true
    }
    anim = new AnimationComponent(mixer, actions)
    if (actions.walk) anim.playAction('walk', 0)
    else if (actions.idle) anim.playAction('idle', 0)
  } else {
    const body = new Mesh(
      new BoxGeometry(0.55, 1.5, 0.35),
      new MeshStandardMaterial({ color: 0x4d5a3a }),
    )
    body.position.y = 0.75
    root.add(body)
    const head = new Mesh(
      new BoxGeometry(0.38, 0.38, 0.38),
      new MeshStandardMaterial({ color: 0x6b7a4a }),
    )
    head.position.y = 1.7
    root.add(head)
  }

  scene.add(root)

  const entity = world.createEntity()
  const zc = new ZombieComponent()
  zc.speed = speed
  entity.addComponent(zc)
  entity.addComponent(new HealthComponent(50, 50))
  entity.addComponent(new VelocityComponent())
  entity.addComponent(new MeshComponent(root))
  if (anim) entity.addComponent(anim)
  return entity
}
