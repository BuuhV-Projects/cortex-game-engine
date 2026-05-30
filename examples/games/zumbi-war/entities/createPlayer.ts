import {
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  PointLight,
  type AnimationClip,
  type Object3D,
  type World,
  type Scene,
} from 'cortex-game-engine'
import { PlayerComponent } from '../components/PlayerComponent'
import { VelocityComponent } from '../components/VelocityComponent'
import { HealthComponent } from '../components/HealthComponent'
import { WeaponComponent } from '../components/WeaponComponent'
import { InputStateComponent } from '../components/InputStateComponent'
import { MeshComponent } from '../components/MeshComponent'
import { MuzzleFlashComponent } from '../components/MuzzleFlashComponent'
import { AnimationComponent } from '../components/AnimationComponent'
import { buildAnimations, LOOP_ONCE } from '../utils/characterAnims'
import type { Entity } from 'cortex-game-engine'

export interface PlayerAssets {
  model: Group
  clips: {
    idle?: AnimationClip
    walk?: AnimationClip
    run?: AnimationClip
    fire?: AnimationClip
    death?: AnimationClip
  }
}

/**
 * Cria a entidade do player. Quando `assets` é null, usa stand-in
 * com BoxGeometry (modo "fallback").
 *
 * O mixer é criado direto no modelo FBX porque o player é instância
 * única — não precisa de `cloneSkinned`.
 */
export function createPlayer(
  world: World,
  scene: Scene,
  assets: PlayerAssets | null,
): Entity {
  const root = new Group()

  let anim: AnimationComponent | null = null

  if (assets) {
    const model = assets.model
    model.scale.setScalar(0.012)
    model.position.y = 0
    // FBX Mixamo vem olhando +Z; convenção do jogo é forward = -Z.
    model.rotation.y = Math.PI
    model.traverse((obj: Object3D) => {
      obj.castShadow = false
      obj.receiveShadow = false
    })
    root.add(model)

    const { mixer, actions } = buildAnimations(model, assets.clips)
    if (actions.death) {
      actions.death.setLoop(LOOP_ONCE, 1)
      actions.death.clampWhenFinished = true
    }
    anim = new AnimationComponent(mixer, actions)
    if (actions.idle) anim.playAction('idle', 0)
    else if (actions.walk) anim.playAction('walk', 0)
  } else {
    const body = new Mesh(
      new BoxGeometry(0.6, 1.6, 0.4),
      new MeshStandardMaterial({ color: 0x556644 }),
    )
    body.position.y = 0.8
    root.add(body)
    const head = new Mesh(
      new BoxGeometry(0.4, 0.4, 0.4),
      new MeshStandardMaterial({ color: 0xb89070 }),
    )
    head.position.y = 1.8
    root.add(head)
  }

  const rifle = new Mesh(
    new BoxGeometry(0.08, 0.08, 0.9),
    new MeshStandardMaterial({ color: 0x121212, roughness: 0.4 }),
  )
  rifle.position.set(0.25, 1.35, -0.4)
  root.add(rifle)

  const muzzle = new PointLight(0xffbb55, 0, 6, 2)
  muzzle.position.set(0.25, 1.45, -0.9)
  root.add(muzzle)

  scene.add(root)

  const entity = world.createEntity()
  entity.addComponent(new PlayerComponent())
  entity.addComponent(new VelocityComponent())
  entity.addComponent(new HealthComponent(100, 100))
  entity.addComponent(new WeaponComponent())
  entity.addComponent(new InputStateComponent())
  entity.addComponent(new MeshComponent(root))
  entity.addComponent(new MuzzleFlashComponent(muzzle))
  if (anim) entity.addComponent(anim)
  return entity
}
