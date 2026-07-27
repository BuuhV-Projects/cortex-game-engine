/**
 * **Ventilador de ar** (script anexável — ADR-0085, SPEC-0157). Anexe ao
 * `propeller_trampoline_1_001.glb` do kit: um ventilador engaiolado sob uma
 * grade. NÃO é trampolim — o vento é uma CORRENTE contínua que segura o player
 * no ar (sensação de voo), e ela **pulsa**: liga por `ligado` segundos, desliga
 * por `desligado`, e recomeça. Ligado, quem está na coluna de ar acima da grade
 * ganha empuxo pra cima (acelera `forca` até `subidaMax`; a gravidade briga de
 * volta — é o que dá o flutuar). Desligado, o player cai de volta na grade.
 *
 * ## A hélice TEM que girar (transform de nó)
 * O `.glb` entrega a hélice como nó filho separado (`propeller_trampoline_2_001`)
 * dentro da gaiola — o tipo de animação certo é **transform** desse nó (tabela
 * de critério do kit). O giro acompanha o vento: acelera quando liga e freia
 * até parar quando desliga — vento pulsando com hélice parada leria como bug.
 */
import {
  ScriptBehavior,
  CharacterBodyComponent,
  TransformComponent,
  Box3,
  type Object3D,
  type ScriptFieldSchema,
} from 'cortex-game-engine'

const _box = new Box3()

/** Prefixo do nó da hélice no `.glb` do kit (filho da gaiola). */
const PROPELLER_NODE_PREFIX = 'propeller_trampoline_2'
/** Folga horizontal além do raio da grade pra coluna de ar (m). */
const RADIUS_MARGIN = 0.2
/** Tolerância abaixo do topo da grade pra considerar o player "na coluna" (m). */
const FOOT_MARGIN = 0.3
/** Resposta do giro da hélice ao ligar/desligar (1/s — maior = mais brusco). */
const SPIN_RESPONSE = 3

/**
 * Fase do ciclo de vento: `true` = vento LIGADO no instante `elapsed`. O ciclo
 * é `on + off` segundos, começando ligado. Pura de propósito — é a regra que
 * faz o vento "parar e ativar toda hora"; ciclo não-positivo = sempre ligado.
 */
export function windIsOn(elapsed: number, on: number, off: number): boolean {
  const cycle = on + off
  if (cycle <= 0) return true
  return elapsed % cycle < on
}

export class FanUpdraftScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Ventilador'

  static fields: ScriptFieldSchema = {
    forca: { type: 'number', default: 40, label: 'Força do vento (m/s²)' },
    subidaMax: { type: 'number', default: 7, label: 'Subida máxima (m/s)' },
    alturaVento: { type: 'number', default: 8, label: 'Altura da coluna de ar (m)' },
    ligado: { type: 'number', default: 2.5, label: 'Vento ligado (s)' },
    desligado: { type: 'number', default: 1.5, label: 'Vento desligado (s)' },
    giroHelice: { type: 'number', default: 12, label: 'Giro da hélice (rad/s)' },
  }

  forca = 40
  subidaMax = 7
  alturaVento = 8
  ligado = 2.5
  desligado = 1.5
  giroHelice = 12

  private elapsed = 0
  /** Velocidade ATUAL da hélice — persegue o alvo (giroHelice ou 0) suavemente. */
  private spinSpeed = 0
  private propeller: Object3D | null = null
  private radius = 2.5
  private topY = 0
  private measured = false

  override onStart(): void {
    this.object3d?.traverse((child) => {
      if (child.name.startsWith(PROPELLER_NODE_PREFIX)) this.propeller = child
    })
  }

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return
    if (!this.measured) {
      // 1º frame: mede a grade (topo = boca da coluna de ar; raio no plano XZ).
      this.measured = true
      _box.setFromObject(obj)
      this.radius =
        Math.max(_box.max.x - obj.position.x, _box.max.z - obj.position.z) + RADIUS_MARGIN
      this.topY = _box.max.y - obj.position.y
      return
    }

    this.elapsed += dt
    const on = windIsOn(this.elapsed, this.ligado, this.desligado)

    // Hélice acompanha o vento: acelera ao ligar, freia até PARAR ao desligar.
    const targetSpin = on ? this.giroHelice : 0
    this.spinSpeed += (targetSpin - this.spinSpeed) * Math.min(1, SPIN_RESPONSE * dt)
    if (this.propeller) this.propeller.rotation.y += this.spinSpeed * dt

    if (!on) return

    const player = this.ctx.world.query(CharacterBodyComponent)[0]
    if (!player) return
    const body = player.getComponent(CharacterBodyComponent)
    const t = player.getComponent(TransformComponent)
    if (!body || !t) return

    // Está na coluna de ar? (cilindro: raio da grade × alturaVento acima dela)
    const top = obj.position.y + this.topY
    const rx = t.x - obj.position.x
    const rz = t.z - obj.position.z
    const withinRadius = rx * rx + rz * rz < this.radius * this.radius
    const withinColumn = withinRadius && t.y > top - FOOT_MARGIN && t.y < top + this.alturaVento
    if (!withinColumn) return

    // Empuxo: acelera pra cima até a subida máxima (a gravidade desconta sozinha).
    body.velocityY = Math.min(body.velocityY + this.forca * dt, this.subidaMax)
  }
}
