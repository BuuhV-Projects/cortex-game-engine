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
 * ## A correia TEM que "correr" na tela
 * Empurrar o player com a superfície parada lê como bug. Dois caminhos, conforme
 * o asset:
 * 1. **Material de correia próprio** (kit espacial, `obstacle_15`): a correia é
 *    uma primitiva com material `Road` e textura dedicada — o script clona
 *    material+texturas por instância e rola o `offset` (UV scroll).
 * 2. **ONDA DE LUZ nas setas** (kit aquapark, `obstacle_9` — spec 0019,
 *    ajuste 7 v2): a peça usa o ATLAS num material só (uv-scroll vazaria) e
 *    DESLIZAR as setas leu mal (rejeitado). O pipeline (`split-belt-arrows.mjs`
 *    do stage) separa cada chevron num nó `*_arrow_<n>` (ordenados por Z
 *    local); o script clona o material de cada um e acende o emissivo em
 *    cascata (letreiro/marquee, 1 a cada 3 acesa) — a luz corre na direção e
 *    velocidade do empurrão, sem geometria se movendo.
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
/** Nós por-seta gerados pelo pipeline (`split-belt-arrows.mjs`): `*_arrow_<n>`. */
const ARROW_NODE_PATTERN = /_arrow_(\d+)$/
/** Cor do brilho das setas acesas (amarelo do próprio atlas). */
const ARROW_GLOW_COLOR = 0xffc400
/** Intensidade emissiva da seta no pico da onda (moderada: bloom estoura acima). */
const ARROW_GLOW_INTENSITY = 2.2
/** Período do letreiro em SETAS: a cada N, uma acesa (padrão de esteira real). */
const MARQUEE_GROUP = 3
/** Expoente que afina o pulso (maior = acende/apaga mais seco, mais legível). */
const MARQUEE_SHARPNESS = 3

/** Material com canal emissivo (o do atlas é MeshStandard — sempre tem). */
interface EmissiveMaterial {
  emissive: { setHex(hex: number): void }
  emissiveIntensity: number
  clone(): EmissiveMaterial
}

export class ConveyorScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Esteira'

  static fields: ScriptFieldSchema = {
    direcao: { type: 'number', default: 0, label: 'Direção da correia (°, 0=+X)' },
    velocidade: { type: 'number', default: 2.4, label: 'Velocidade (m/s)' },
    uvPorMetro: { type: 'number', default: 0.5, label: 'Repetições de textura por metro' },
    sentidoUV: { type: 'number', default: -1, label: 'Sentido do desenho (+1/−1)' },
    eixoUV: { type: 'select', default: 'v', label: 'Eixo do UV que corre', options: ['u', 'v'] },
    passoSetas: { type: 'number', default: 0.433, label: 'Espaço entre setas (m) — ritmo da onda' },
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
  /** Espaçamento entre chevrons (m) — converte velocidade em setas/segundo. */
  passoSetas = 0.433

  private dx = 1
  private dz = 0
  private halfX = 0
  private halfZ = 0
  private topY = 0
  private measured = false
  /** Texturas (já clonadas) cujo offset este script rola a cada quadro. */
  private beltTextures: Texture[] = []
  /** Materiais das setas `*_arrow_<n>` (clonados), em ordem de Z local. */
  private arrowMaterials: EmissiveMaterial[] = []
  /** Deslocamento acumulado da correia (m) — fase da onda de luz. */
  private beltScroll = 0

  override onStart(): void {
    // Setas separadas por nó (kit aquapark)? Onda de luz por emissivo.
    const arrows: { index: number; node: Object3D }[] = []
    this.object3d?.traverse((child) => {
      const match = ARROW_NODE_PATTERN.exec(child.name)
      if (match) arrows.push({ index: Number(match[1]), node: child })
    })
    if (arrows.length > 0) {
      arrows.sort((a, b) => a.index - b.index)
      for (const { node } of arrows) {
        const mesh = node as Mesh
        if (!mesh.isMesh) continue
        const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as unknown as EmissiveMaterial
        const own = source.clone()
        own.emissive.setHex(ARROW_GLOW_COLOR)
        own.emissiveIntensity = 0
        mesh.material = own as unknown as Mesh['material']
        this.arrowMaterials.push(own)
      }
      return
    }
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

    // A superfície "CORRE" na mesma proporção do empurrão — é o que torna a
    // mecânica legível antes mesmo de o player pisar nela.
    if (this.arrowMaterials.length > 0) {
      // Onda de luz (letreiro): fase em UNIDADES DE SETA; a cada MARQUEE_GROUP
      // setas uma fica no pico, e o padrão anda 1 seta a cada passo/velocidade.
      this.beltScroll += this.velocidade * this.sentidoUV * dt
      const phase = this.beltScroll / Math.max(0.01, this.passoSetas)
      const n = this.arrowMaterials.length
      for (let i = 0; i < n; i++) {
        const local = (((phase - i) % MARQUEE_GROUP) + MARQUEE_GROUP) % MARQUEE_GROUP
        const wave = 0.5 * (1 + Math.cos((2 * Math.PI * local) / MARQUEE_GROUP))
        this.arrowMaterials[i]!.emissiveIntensity = ARROW_GLOW_INTENSITY * Math.pow(wave, MARQUEE_SHARPNESS)
      }
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
