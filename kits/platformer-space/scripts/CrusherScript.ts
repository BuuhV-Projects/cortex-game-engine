/**
 * **Prensa / bate-bate** (script anexável — ADR-0085). Anexe a uma barra ou bloco
 * (ex.: `obstacle_11_001` do kit): fica um tempo recolhido (TELEGRAPH — o aviso),
 * dá um golpe RÁPIDO na direção do `eixo`, segura fechado e recolhe devagar, em
 * loop. Esmaga (mata) quem estiver na zona durante o golpe. O timing é o desafio:
 * atravesse na janela em que está recolhido.
 *
 * Ritmo pesquisado (crusher de plataforma): a pausa recolhido é longa (leitura),
 * a descida é curta (impacto), e a subida é lenta (dá a janela de passagem). Move
 * por delta a partir da posição inicial — mover no editor não reseta. Só gatilho
 * (desliga raycast): a mecânica é o golpe letal, não pisar em cima.
 */
import {
  ScriptBehavior,
  CharacterBodyComponent,
  TransformComponent,
  Vector3,
  type ScriptFieldSchema,
} from 'cortex-game-engine'

const _pos = new Vector3()

/** Tempos do ciclo da prensa (s) + curso (m). */
export interface CrusherTiming {
  pausaAberto: number
  descida: number
  pausaFechado: number
  subida: number
  curso: number
}

/**
 * Fase da prensa pelo relógio do ciclo — LÓGICA PURA (testável sem ECS). Retorna
 * o deslocamento (0..curso) e se está na janela LETAL (golpe + fechado). O golpe
 * só fica letal após 40% da descida (dá reação); recolher nunca é letal.
 */
export function crusherPhase(clock: number, c: CrusherTiming): { off: number; lethal: boolean } {
  const cycle = c.pausaAberto + c.descida + c.pausaFechado + c.subida
  let t = ((clock % cycle) + cycle) % cycle
  if (t < c.pausaAberto) return { off: 0, lethal: false }
  t -= c.pausaAberto
  if (t < c.descida) return { off: c.curso * (t / c.descida), lethal: t > c.descida * 0.4 }
  t -= c.descida
  if (t < c.pausaFechado) return { off: c.curso, lethal: true }
  t -= c.pausaFechado
  return { off: c.curso * (1 - t / c.subida), lethal: false }
}

export class CrusherScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Prensa'

  static fields: ScriptFieldSchema = {
    curso: { type: 'number', default: 3, label: 'Curso do golpe (m)' },
    eixo: { type: 'select', default: 'y', label: 'Eixo do golpe', options: ['x', 'y', 'z'] },
    sentido: { type: 'number', default: -1, label: 'Sentido (+1/−1)' },
    pausaAberto: { type: 'number', default: 1.1, label: 'Pausa recolhido (s, telegraph)' },
    descida: { type: 'number', default: 0.14, label: 'Tempo do golpe (s)' },
    pausaFechado: { type: 'number', default: 0.35, label: 'Pausa fechado (s)' },
    subida: { type: 'number', default: 0.8, label: 'Tempo pra recolher (s)' },
    raio: { type: 'number', default: 1.8, label: 'Raio letal (na fase do golpe)' },
  }

  curso = 3
  eixo = 'y'
  sentido = -1
  pausaAberto = 1.1
  descida = 0.14
  pausaFechado = 0.35
  subida = 0.8
  raio = 1.8

  private clock = 0
  private prevOff = 0
  private cd = 0

  override onStart(): void {
    this.object3d?.traverse((c) => {
      ;(c as unknown as { raycast: () => void }).raycast = () => {}
    })
  }

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return
    this.clock += dt
    const { off, lethal } = crusherPhase(this.clock, this)

    // Aplica o deslocamento por DELTA a partir da posição atual.
    const delta = (off - this.prevOff) * this.sentido
    this.prevOff = off
    if (this.eixo === 'x') obj.position.x += delta
    else if (this.eixo === 'y') obj.position.y += delta
    else obj.position.z += delta

    // Morte só na fase do golpe, por proximidade da posição-mundo da prensa.
    if (this.cd > 0) {
      this.cd -= dt
      return
    }
    if (!lethal) return
    const t = this.ctx.world.query(CharacterBodyComponent)[0]?.getComponent(TransformComponent)
    if (!t) return
    obj.getWorldPosition(_pos)
    const dx = t.x - _pos.x
    const dz = t.z - _pos.z
    if (dx * dx + dz * dz < this.raio * this.raio && Math.abs(t.y - _pos.y) < this.raio + 1.4) {
      this.cd = 0.5
      document.dispatchEvent(new CustomEvent('rush:die'))
    }
  }
}
