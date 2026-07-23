/**
 * **Serra cortante** (script anexável — ADR-0085). Anexe a um obstáculo de lâmina/
 * espinhos rotativos (ex.: `obstacle_12_001`/`obstacle_13_001` do kit espacial):
 * gira rápido no próprio plano (leitura de "corta") e MATA ao encostar (raio letal
 * na lâmina). Opcionalmente PERCORRE um caminho em vai-e-vem (`amplitude`/`eixo`),
 * o padrão de serra que patrulha um corredor — ver Slow Mole / SEUM.
 *
 * Só gatilho + visual: `onStart` desliga o raycast dos filhos (a lâmina não é
 * chão). A morte dispara `rush:die` (o CourseController devolve ao checkpoint),
 * com cooldown curto pra não re-disparar durante o teleporte (igual ao Perigo).
 */
import {
  ScriptBehavior,
  CharacterBodyComponent,
  TransformComponent,
  Vector3,
  type ScriptFieldSchema,
} from 'cortex-game-engine'

const _pos = new Vector3()

export class SawScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Serra'

  static fields: ScriptFieldSchema = {
    giro: { type: 'number', default: 9, label: 'Giro da lâmina (rad/s)' },
    raio: { type: 'number', default: 1.6, label: 'Raio letal' },
    eixoGiro: { type: 'select', default: 'z', label: 'Eixo de giro', options: ['x', 'y', 'z'] },
    amplitude: { type: 'number', default: 0, label: 'Curso do vai-e-vem (m, 0=parada)' },
    eixo: { type: 'select', default: 'x', label: 'Eixo do percurso', options: ['x', 'y', 'z'] },
    velocidade: { type: 'number', default: 1.5, label: 'Velocidade do percurso (rad/s)' },
  }

  giro = 9
  raio = 1.6
  eixoGiro = 'z'
  amplitude = 0
  eixo = 'x'
  velocidade = 1.5

  private cd = 0
  private t = 0
  private prev = 0
  private started = false

  override onStart(): void {
    // Lâmina nunca é chão/parede — só gatilho letal + giro visual.
    this.object3d?.traverse((c) => {
      ;(c as unknown as { raycast: () => void }).raycast = () => {}
    })
  }

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return

    // Giro visual da lâmina (leitura de "corta").
    if (this.eixoGiro === 'x') obj.rotation.x += this.giro * dt
    else if (this.eixoGiro === 'y') obj.rotation.y += this.giro * dt
    else obj.rotation.z += this.giro * dt

    // Vai-e-vem opcional (serra que patrulha um corredor) — por delta, senoide.
    if (this.amplitude > 0) {
      if (!this.started) {
        this.started = true
        this.prev = 0
      }
      this.t += dt * this.velocidade
      const cur = Math.sin(this.t) * this.amplitude
      const delta = cur - this.prev
      this.prev = cur
      if (this.eixo === 'x') obj.position.x += delta
      else if (this.eixo === 'y') obj.position.y += delta
      else obj.position.z += delta
    }

    // Morte por contato (raio letal na posição-mundo da lâmina).
    if (this.cd > 0) {
      this.cd -= dt
      return
    }
    const t = this.ctx.world.query(CharacterBodyComponent)[0]?.getComponent(TransformComponent)
    if (!t) return
    obj.getWorldPosition(_pos)
    const dx = t.x - _pos.x
    const dz = t.z - _pos.z
    if (dx * dx + dz * dz < this.raio * this.raio && Math.abs(t.y - _pos.y) < this.raio + 1.2) {
      this.cd = 0.5
      document.dispatchEvent(new CustomEvent('rush:die'))
    }
  }
}
