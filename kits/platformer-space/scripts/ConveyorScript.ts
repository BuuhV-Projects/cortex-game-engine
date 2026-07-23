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
 * (ver a tabela de critério de animação na spec 0010), não transform nem osso. O
 * `.glb` do kit já entrega isso de bandeja: a correia é uma primitiva com material
 * próprio (`Road`, textura `Metal_road`), separado da carcaça (`Color`) e das
 * luzes (`Emission`) — então dá pra rolar só ela. O material E a textura são
 * CLONADOS por instância: `map`/`emissiveMap` vêm compartilhados do cache do
 * loader e, sem clonar, o offset de uma esteira vazaria pra todas.
 */
import {
  ScriptBehavior,
  CharacterBodyComponent,
  TransformComponent,
  Box3,
  RepeatWrapping,
  type Mesh,
  type Texture,
  type ScriptFieldSchema,
} from 'cortex-game-engine'

const _box = new Box3()

/** Nome do material da correia no `.glb` do kit (a carcaça usa outro). */
const BELT_MATERIAL_NAME = 'Road'
/** Mapas de textura que precisam rolar juntos (senão a luz "descola" do desenho). */
const SCROLLED_MAPS = ['map', 'emissiveMap', 'normalMap'] as const

export class ConveyorScript extends ScriptBehavior {
  /** Nome persistido nas cenas (as fases declaram por este nome). */
  static override scriptName = 'Esteira'

  static fields: ScriptFieldSchema = {
    direcao: { type: 'number', default: 0, label: 'Direção da correia (°, 0=+X)' },
    velocidade: { type: 'number', default: 2.4, label: 'Velocidade (m/s)' },
    uvPorMetro: { type: 'number', default: 0.5, label: 'Repetições de textura por metro' },
    sentidoUV: { type: 'number', default: -1, label: 'Sentido do desenho (+1/−1)' },
    eixoUV: { type: 'select', default: 'v', label: 'Eixo do UV que corre', options: ['u', 'v'] },
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

  private dx = 1
  private dz = 0
  private halfX = 0
  private halfZ = 0
  private topY = 0
  private measured = false
  /** Texturas (já clonadas) cujo offset este script rola a cada quadro. */
  private beltTextures: Texture[] = []

  override onStart(): void {
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

    // A superfície CORRE (UV scroll) na mesma proporção do empurrão — é o que
    // torna a mecânica legível antes mesmo de o player pisar nela.
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
