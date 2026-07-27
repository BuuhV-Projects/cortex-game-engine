/**
 * **Pêndulo com rolo de espetos** (script anexável — ADR-0085). É a mecânica do
 * `obstacle_12_001`/`obstacle_13_001` do kit espacial — que NÃO é uma serra: o
 * asset é um **pórtico em U** que balança pra frente e pra trás, com um
 * **cilindro cravejado girando no próprio eixo** pendurado na ponta de baixo.
 *
 * ## Por que não precisa de osso (o GLB já diz como quer ser animado)
 * O `.glb` vem hierárquico e pivotado:
 * ```
 * node "obstacle_12_001"  T=[0,0,0]        → PÓRTICO; a origem está no TOPO, na
 *                                            linha das duas juntas (x ≈ ±3,54).
 *                                            É o EIXO do pêndulo, já no lugar.
 *   node "obstacle_12_002" T=[0,−3.823,0]  → ROLO de espetos, cilindros com eixo
 *                                            em X, já na ponta do braço.
 * skins: 0   animations: nenhuma
 * ```
 * Logo a animação sai de **transform de dois nós** (ver a tabela de critério de
 * animação na spec 0010):
 *  - **balanço** = rotação do nó RAIZ em torno de **X** (as juntas estão em X, então
 *    girar em X varre a ponta pra frente e pra trás);
 *  - **giro do rolo** = rotação do FILHO em torno de **X** (o eixo dos cilindros),
 *    contínua e rápida.
 *
 * ## Armadilha: `rotation.x` gira no eixo do MUNDO, não no local
 * A peça é assentada com `rotY` pra ficar transversal ao traçado (que corre na
 * diagonal da câmera). Escrever `obj.rotation.x = swing` com a ordem de Euler
 * padrão (`XYZ`) aplica o giro em torno do X do **mundo** — o arco saía torto,
 * varrendo de lado em vez de pra frente e pra trás. Por isso o balanço é composto
 * por **quaternion multiplicado à direita** da orientação de repouso: aí o eixo é
 * o LOCAL da peça, qualquer que seja o `rotY`. (O rolo nunca sofreu disso: sendo
 * filho, o `rotation.x` dele já é local — daí ele girar certo enquanto o pórtico
 * balançava errado.) Os três eixos ficam trocáveis no Inspector, e girar a peça
 * por lá durante o play redefine o repouso ao vivo.
 *
 * A letalidade acompanha a **posição-mundo do ROLO**, não a do pórtico — o raiz
 * fica ~4u acima e mataria no lugar errado. Como o pórtico não é chão, o
 * `onStart` desliga o raycast de tudo (só gatilho + visual).
 */
import {
  ScriptBehavior,
  CharacterBodyComponent,
  TransformComponent,
  Vector3,
  Quaternion,
  type Object3D,
  type ScriptFieldSchema,
} from 'cortex-game-engine'

const _pos = new Vector3()
/** Quaternion de trabalho do balanço (evita alocar por quadro). */
const _swing = new Quaternion()

/** Eixos locais possíveis do balanço e do rolo (todos ficam trocáveis no Inspector). */
const AXES = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
} as const
type AxisName = keyof typeof AXES

/**
 * Sufixo do nó do rolo nos `.glb` do kit (`obstacle_12_002`, `obstacle_13_002`).
 * Fallback: o primeiro filho — nos dois assets o rolo é o único filho.
 */
const ROLLER_NODE_SUFFIX = '_002'
/** Folga vertical extra do raio letal (o rolo é largo em X, achatado em YZ). */
const LETHAL_HEIGHT_SLACK = 1.2
/** Espera antes de poder matar de novo (evita re-disparo durante o respawn). */
const DEATH_COOLDOWN = 0.5
const DEG_TO_RAD = Math.PI / 180

export class SpikeRollerPendulumScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'PenduloEspetos'

  static fields: ScriptFieldSchema = {
    angulo: { type: 'number', default: 45, label: 'Amplitude do balanço (°, 0=parado)' },
    balanco: { type: 'number', default: 1.4, label: 'Velocidade do balanço (rad/s)' },
    eixoBalanco: { type: 'select', default: 'x', label: 'Eixo do balanço', options: ['x', 'y', 'z'] },
    giroRolo: { type: 'number', default: 7, label: 'Giro do rolo de espetos (rad/s)' },
    eixoRolo: { type: 'select', default: 'x', label: 'Eixo do rolo', options: ['x', 'y', 'z'] },
    raio: { type: 'number', default: 1.6, label: 'Raio letal (no rolo)' },
    fase: { type: 'number', default: 0, label: 'Defasagem do balanço (rad)' },
  }

  angulo = 45
  balanco = 1.4
  eixoBalanco = 'x'
  giroRolo = 7
  eixoRolo = 'x'
  raio = 1.6
  fase = 0

  private clock = 0
  private cooldown = 0
  private roller: Object3D | null = null
  /** Orientação de repouso do pórtico (o `rotY` que alinha a peça ao traçado). */
  private readonly rest = new Quaternion()
  /** Última orientação escrita por este script — detecta edição externa. */
  private readonly applied = new Quaternion()

  override onStart(): void {
    const obj = this.object3d
    if (!obj) return
    // Pórtico e rolo nunca são chão — só gatilho letal + visual.
    this.disableRaycast(obj)
    let roller: Object3D | null = null
    obj.traverse((child) => {
      if (!roller && child !== obj && child.name.endsWith(ROLLER_NODE_SUFFIX)) roller = child
    })
    this.roller = roller ?? obj.children[0] ?? null
    this.rest.copy(obj.quaternion)
    this.applied.copy(obj.quaternion)
  }

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return
    this.clock += dt

    // Balanço do pórtico: senoide em torno do eixo das juntas (X no obstacle_12).
    // `angulo: 0` deixa o pórtico parado — é o caso do portal com rolo vertical.
    const swing = Math.sin(this.clock * this.balanco + this.fase) * this.angulo * DEG_TO_RAD
    // Se alguém girou a peça por fora (Inspector, ao vivo), essa é a nova
    // orientação de repouso — senão o script sobrescreveria a edição.
    if (!obj.quaternion.equals(this.applied)) this.rest.copy(obj.quaternion)
    // O balanço é aplicado no espaço LOCAL (multiplicação à DIREITA do repouso).
    // Escrever `rotation.x` direto giraria em torno do X do MUNDO — com a peça
    // alinhada ao traçado por `rotY`, o arco saía torto (varria de lado em vez
    // de pra frente e pra trás). Ver a armadilha na spec 0010.
    _swing.setFromAxisAngle(AXES[this.eixoBalanco as AxisName] ?? AXES.x, swing)
    obj.quaternion.copy(this.rest).multiply(_swing)
    this.applied.copy(obj.quaternion)
    // Rolo cravejado girando no próprio eixo (o dos cilindros do asset).
    if (this.roller) {
      if (this.eixoRolo === 'y') this.roller.rotation.y += this.giroRolo * dt
      else if (this.eixoRolo === 'z') this.roller.rotation.z += this.giroRolo * dt
      else this.roller.rotation.x += this.giroRolo * dt
    }

    if (this.cooldown > 0) {
      this.cooldown -= dt
      return
    }
    const t = this.ctx.world.query(CharacterBodyComponent)[0]?.getComponent(TransformComponent)
    if (!t) return
    // A zona letal segue o ROLO (a ponta que varre), não o pivô lá em cima.
    ;(this.roller ?? obj).getWorldPosition(_pos)
    const dx = t.x - _pos.x
    const dz = t.z - _pos.z
    if (dx * dx + dz * dz < this.raio * this.raio && Math.abs(t.y - _pos.y) < this.raio + LETHAL_HEIGHT_SLACK) {
      this.cooldown = DEATH_COOLDOWN
      document.dispatchEvent(new CustomEvent('rush:die'))
    }
  }
}
