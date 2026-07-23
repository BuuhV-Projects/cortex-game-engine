/**
 * **Plataforma giratória** (script anexável — ADR-0085). Anexe a um disco/plataforma
 * sólida (ex.: `obstacle_8_001` do kit, o disco rotativo): gira devagar em Y e
 * CARREGA quem está em pé nela, rotacionando o player em torno do centro (carrossel).
 * Fica sólida (é chão): o collider vem do `role: platform`/JSON; o script só gira e
 * transporta. Cria travessia com timing — quem está na borda descreve um arco maior.
 *
 * Diferente do `MarteloGiratorio` (que ARREMESSA), aqui o giro é um transporte
 * amigável: o player anda por cima enquanto roda. Move o player por delta angular
 * no TransformComponent (mesmo princípio do carryRider da Patrulha).
 */
import { ScriptBehavior, CharacterBodyComponent, TransformComponent, Box3 } from 'cortex-game-engine'

const _box = new Box3()

export class RotatingPlatformScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'PlataformaGiratoria'

  static fields = {
    giro: { type: 'number', default: 0.6, label: 'Giro (rad/s, +horário)' },
  } as const

  giro = 0.6

  private radius = 4
  private topY = 0
  private measured = false

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return
    if (!this.measured) {
      this.measured = true
      _box.setFromObject(obj)
      this.radius = Math.max(_box.max.x - obj.position.x, _box.max.z - obj.position.z) + 0.3
      this.topY = _box.max.y - obj.position.y
      return
    }

    const dAng = this.giro * dt
    obj.rotation.y += dAng

    // Carrega quem está EM PÉ no disco: rotaciona a posição do player em torno
    // do centro pelo mesmo ângulo (arco = distância ao centro × dAng).
    const player = this.ctx.world.query(CharacterBodyComponent)[0]
    if (!player) return
    const body = player.getComponent(CharacterBodyComponent)
    const t = player.getComponent(TransformComponent)
    if (!body || !t || !body.grounded) return

    const top = obj.position.y + this.topY
    const rx = t.x - obj.position.x
    const rz = t.z - obj.position.z
    const withinDisc = rx * rx + rz * rz < this.radius * this.radius
    const onTop = withinDisc && t.y > top - 0.3 && t.y < top + 1.0
    if (!onTop) return

    // Rotação 2D de (rx,rz) por dAng em torno do centro (mesmo sentido do disco).
    const c = Math.cos(dAng)
    const s = Math.sin(dAng)
    t.x = obj.position.x + rx * c - rz * s
    t.z = obj.position.z + rx * s + rz * c
  }
}
