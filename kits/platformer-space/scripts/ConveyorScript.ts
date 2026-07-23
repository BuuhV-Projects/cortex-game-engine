/**
 * **Esteira rolante** (script anexável — ADR-0085). Anexe a uma PLATAFORMA sólida
 * (ex.: `obstacle_15_001.glb`, o conveyor do kit espacial): quem estiver **em pé
 * nela** é empurrado na direção da correia, somando a velocidade da esteira à do
 * player (padrão clássico de plataforma — Mario/Sonic). Fica sólida (é chão): o
 * collider vem do `role: platform`/JSON; o script só CARREGA quem está no tampo.
 *
 * Cria decisão de movimento: a favor da correia você corre mais rápido; contra,
 * mal sai do lugar. `direcao` em graus no plano XZ (0=+X, 90=+Z) — alinhe com a
 * seta visual do modelo. Move por delta no TransformComponent (mesmo método do
 * `carryRider` da Patrulha), então mover a esteira no editor não a "reseta".
 */
import { ScriptBehavior, CharacterBodyComponent, TransformComponent, Box3 } from 'cortex-game-engine'

const _box = new Box3()

export class ConveyorScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Esteira'

  static fields = {
    direcao: { type: 'number', default: 0, label: 'Direção da correia (°, 0=+X)' },
    velocidade: { type: 'number', default: 2.4, label: 'Velocidade (m/s)' },
  } as const

  direcao = 0
  velocidade = 2.4

  private dx = 1
  private dz = 0
  private halfX = 0
  private halfZ = 0
  private topY = 0
  private measured = false

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return
    if (!this.measured) {
      // 1º frame: pré-computa direção e mede o tampo (bounds locais à posição).
      this.measured = true
      const rad = (this.direcao * Math.PI) / 180
      this.dx = Math.cos(rad)
      this.dz = Math.sin(rad)
      _box.setFromObject(obj)
      this.halfX = (_box.max.x - _box.min.x) / 2
      this.halfZ = (_box.max.z - _box.min.z) / 2
      this.topY = _box.max.y - obj.position.y
      return
    }

    const player = this.ctx.world.query(CharacterBodyComponent)[0]
    if (!player) return
    const body = player.getComponent(CharacterBodyComponent)
    const t = player.getComponent(TransformComponent)
    if (!body || !t || !body.grounded) return

    // Está em pé no tampo? (dentro da moldura + pés na altura do topo)
    const top = obj.position.y + this.topY
    const onTop =
      Math.abs(t.x - obj.position.x) < this.halfX + 0.2 &&
      Math.abs(t.z - obj.position.z) < this.halfZ + 0.2 &&
      t.y > top - 0.3 &&
      t.y < top + 1.0
    if (!onTop) return

    // Empurra na direção da correia — a velocidade da esteira SOMA à do player.
    const step = this.velocidade * dt
    t.x += this.dx * step
    t.z += this.dz * step
  }
}
