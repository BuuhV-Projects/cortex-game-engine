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
 *
 * ## A correia TEM que correr na tela (UV scroll)
 * Empurrar o player com a superfície parada lê como bug. Aqui a peça é rígida —
 * quem "anda" é só a superfície —, então o tipo de animação certo é **UV scroll**
 * (ver a tabela de critério de animação na spec 0010), não transform nem osso.
 *
 * Dois caminhos, conforme o asset:
 * 1. **Material de correia próprio** (kit espacial, `obstacle_15`): a correia é
 *    uma primitiva com material `Road` e textura dedicada — o script clona
 *    material+texturas por instância e rola o `offset`.
 * 2. **SETAS reais em nó filho** (kit aquapark, `obstacle_9` — spec 0019,
 *    ajuste 7): a peça usa o ATLAS num material só (uv-scroll vazaria), mas os
 *    chevrons do miolo são separados pelo pipeline num nó `*_arrows`
 *    (`split-belt-arrows.mjs` do stage), uniformemente espaçados. O script
 *    move o nó com WRAP de um período (`passoSetas`) na velocidade do
 *    empurrão — as setas circulam como correia de verdade, sem emenda visível.
 */
import {
  ScriptBehavior,
  CharacterBodyComponent,
  TransformComponent,
  Box3,
  RepeatWrapping,
  type Object3D,
  type Mesh,
  type Texture,
  type ScriptFieldSchema,
} from 'cortex-game-engine'

const _box = new Box3()

/** Nome do material da correia no `.glb` do kit (a carcaça usa outro). */
const BELT_MATERIAL_NAME = 'Road'
/** Mapas de textura que precisam rolar juntos (senão a luz "descola" do desenho). */
const SCROLLED_MAPS = ['map', 'emissiveMap', 'normalMap'] as const
/** Sufixo do nó de SETAS gerado pelo pipeline (`split-belt-arrows.mjs`). */
const ARROWS_NODE_SUFFIX = '_arrows'

export class ConveyorScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Esteira'

  static fields: ScriptFieldSchema = {
    direcao: { type: 'number', default: 0, label: 'Direção da correia (°, 0=+X)' },
    velocidade: { type: 'number', default: 2.4, label: 'Velocidade (m/s)' },
    uvPorMetro: { type: 'number', default: 0.5, label: 'Repetições de textura por metro' },
    sentidoUV: { type: 'number', default: -1, label: 'Sentido do desenho (+1/−1)' },
    eixoUV: { type: 'select', default: 'v', label: 'Eixo do UV que corre', options: ['u', 'v'] },
    passoSetas: { type: 'number', default: 0.433, label: 'Período das setas do nó *_arrows (m)' },
  }

  direcao = 0
  velocidade = 2.4
  uvPorMetro = 0.5
  /**
   * O UV do `.glb` corre ao CONTRÁRIO do empurrão com offset positivo (a correia
   * andava pra trás enquanto o player era levado pra frente), então o padrão é
   * −1. Como o desenho da textura é fixo no modelo, o sinal é constante do asset
   * — mas fica editável pra correia montada ao contrário.
   */
  sentidoUV = -1
  eixoUV = 'v'
  /** Espaçamento entre os chevrons do nó `*_arrows` (o wrap usa 1 período). */
  passoSetas = 0.433

  private dx = 1
  private dz = 0
  private halfX = 0
  private halfZ = 0
  private topY = 0
  private measured = false
  /** Texturas (já clonadas) cujo offset este script rola a cada quadro. */
  private beltTextures: Texture[] = []
  /** Nó das SETAS (`*_arrows`, separado pelo pipeline) — movido com wrap. */
  private arrowsNode: Object3D | null = null
  /** Posição Z local original do nó de setas (o wrap oscila em torno dela). */
  private arrowsZ0 = 0
  /** Deslocamento acumulado da correia (m) — vira `position.z` via módulo. */
  private beltScroll = 0

  override onStart(): void {
    // Setas separadas em nó filho (kit aquapark)? Anima por TRANSFORM.
    this.object3d?.traverse((child) => {
      if (!this.arrowsNode && child.name.endsWith(ARROWS_NODE_SUFFIX)) {
        this.arrowsNode = child
        this.arrowsZ0 = child.position.z
      }
    })
    if (this.arrowsNode) return
    // Isola a correia: material + texturas CLONADOS por instância, em modo
    // Repeat (sem isso o offset "estica" a borda em vez de repetir o desenho).
    this.object3d?.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = materials.map((material) => {
        if (!material || material.name !== BELT_MATERIAL_NAME) return material
        const clone = material.clone() as typeof material & Record<string, unknown>
        for (const slot of SCROLLED_MAPS) {
          const texture = clone[slot] as Texture | null | undefined
          if (!texture) continue
          const own = texture.clone()
          own.wrapS = RepeatWrapping
          own.wrapT = RepeatWrapping
          own.needsUpdate = true
          clone[slot] = own
          this.beltTextures.push(own)
        }
        return clone as typeof material
      })
      mesh.material = Array.isArray(mesh.material) ? next : next[0]!
    })
  }

  override onUpdate(dt: number): void {
    const obj = this.object3d
    if (!obj) return

    // A superfície CORRE na mesma proporção do empurrão — é o que torna a
    // mecânica legível antes mesmo de o player pisar nela.
    if (this.arrowsNode) {
      // SETAS reais (nó separado pelo pipeline): deslocamento com WRAP de um
      // período — espaçamento uniforme faz o salto ser invisível e as setas
      // circulam como correia.
      this.beltScroll += this.velocidade * this.sentidoUV * dt
      const passo = Math.max(0.01, this.passoSetas)
      this.arrowsNode.position.z = this.arrowsZ0 + (((this.beltScroll % passo) + passo) % passo)
    }
    const scroll = this.velocidade * this.uvPorMetro * this.sentidoUV * dt
    for (const texture of this.beltTextures) {
      if (this.eixoUV === 'u') texture.offset.x += scroll
      else texture.offset.y += scroll
    }

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
