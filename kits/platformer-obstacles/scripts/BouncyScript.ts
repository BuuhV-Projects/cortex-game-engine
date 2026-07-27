/**
 * **Borracha** (script anexável — ADR-0085, SPEC-0158). Anexe às peças
 * EMBORRACHADAS do kit (`obstacle_18/19/20/21`, `platform_028..030`,
 * `wall_003..015`): ao TOCAR nelas por cima o player sofre um leve **recuo**
 * (pulo de borracha — não é trampolim), a peça faz um **squash** de borracha
 * (achata em Y e engorda em XZ, com retorno elástico) e o script dispara o
 * evento DOM `rush:bounce` — o "poim" de mola que o jogo mapeia no áudio
 * (jogo sem áudio ignora o evento sem quebrar). O gatilho é de BORDA: dispara
 * só ao ENTRAR em contato e rearma quando o player sai.
 *
 * ## O squash anima o FILHO (regra de animação do kit)
 * Nó com `collider` estático vira entidade própria e o sync de transform
 * SOBRESCREVE o root a cada frame (armadilha descoberta nos discos giratórios
 * do teste4) — por isso o squash anima o PRIMEIRO NÓ FILHO do `.glb`, que
 * fica livre do sync; só sem filho é que cai no próprio `object3d`.
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

/** Folga horizontal além do raio da peça pra área de contato (m). */
const RADIUS_MARGIN = 0.2
/**
 * Banda vertical ESTREITA de contato em torno do topo da peça (m). Estreita de
 * propósito (playtest 2026-07-27): com a banda larga (0.4/1.2), um player em pé
 * numa plataforma ~0.8u ACIMA da peça de borracha disparava o bounce sem tocar
 * nela. A queda real cruza o topo a ~0.13u por frame — a banda apertada ainda
 * captura a aterrissagem, mas ignora quem está num piso logo acima.
 */
const FOOT_BELOW = 0.25
const FOOT_ABOVE = 0.6
/** Quanto o squash engorda em XZ em relação ao achatamento em Y (fração). */
const BULGE_RATIO = 0.6

export class BouncyScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Borracha'

  static fields: ScriptFieldSchema = {
    recuo: { type: 'number', default: 6.5, label: 'Recuo do pulo (m/s)' },
    squash: { type: 'number', default: 0.18, label: 'Achatamento (fração)' },
    dur: { type: 'number', default: 0.25, label: 'Duração do squash (s)' },
  }

  recuo = 6.5
  squash = 0.18
  dur = 0.25

  /** Nó animado pelo squash: o 1º FILHO do glb (ver TSDoc do cabeçalho). */
  private squashNode: Object3D | null = null
  private origScale = { x: 1, y: 1, z: 1 }
  /** Timer do squash em andamento; negativo = sem squash ativo. */
  private squashTime = -1
  /** Gatilho de borda: `true` enquanto o player está em contato. */
  private touching = false
  private radius = 2
  private topY = 0
  private measured = false

  override onStart(): void {
    const obj = this.object3d
    if (!obj) return
    // Anima o FILHO de propósito: o root com collider estático é sobrescrito
    // pelo sync de transform a cada frame (armadilha dos discos do teste4).
    this.squashNode = obj.children[0] ?? obj
    this.origScale = {
      x: this.squashNode.scale.x,
      y: this.squashNode.scale.y,
      z: this.squashNode.scale.z,
    }
  }

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return
    if (!this.measured) {
      // 1º frame: mede a peça (topo = superfície de contato; raio no plano XZ).
      this.measured = true
      _box.setFromObject(obj)
      this.radius =
        Math.max(_box.max.x - obj.position.x, _box.max.z - obj.position.z) + RADIUS_MARGIN
      this.topY = _box.max.y - obj.position.y
      return
    }

    this.animateSquash(dt)

    const player = this.ctx.world.query(CharacterBodyComponent)[0]
    if (!player) return
    const body = player.getComponent(CharacterBodyComponent)
    const t = player.getComponent(TransformComponent)
    if (!body || !t) return

    // Contato: pé do player perto do TOPO da peça e dentro do raio XZ.
    const top = obj.position.y + this.topY
    const rx = t.x - obj.position.x
    const rz = t.z - obj.position.z
    const withinRadius = rx * rx + rz * rz < this.radius * this.radius
    const inContact = withinRadius && t.y > top - FOOT_BELOW && t.y < top + FOOT_ABOVE

    if (inContact && !this.touching) {
      // Borda de ENTRADA em contato: recuo + squash + "poim" (uma vez só).
      body.velocityY = Math.max(body.velocityY, this.recuo)
      document.dispatchEvent(new CustomEvent('rush:bounce'))
      this.squashTime = 0
    }
    this.touching = inContact
  }

  /** Squash de borracha: achata em Y, engorda em XZ, restaura exato ao fim. */
  private animateSquash(dt: number): void {
    if (this.squashTime < 0 || !this.squashNode) return
    this.squashTime += dt
    const o = this.origScale
    if (this.squashTime >= this.dur) {
      // Fim do squash: restaura a escala original EXATA (sem drift numérico).
      this.squashNode.scale.set(o.x, o.y, o.z)
      this.squashTime = -1
      return
    }
    const s = Math.sin(Math.PI * (this.squashTime / this.dur))
    this.squashNode.scale.y = o.y * (1 - this.squash * s)
    this.squashNode.scale.x = o.x * (1 + BULGE_RATIO * this.squash * s)
    this.squashNode.scale.z = o.z * (1 + BULGE_RATIO * this.squash * s)
  }
}
