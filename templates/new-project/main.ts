/**
 * Bootstrap do projeto — usa o facade `Game` do engine.
 *
 * `Game` cria e conecta Renderer, Scene, Câmera, World (ECS), Input e o loop. Em
 * DESENVOLVIMENTO o **modo editor** já vem ligado automaticamente pelo engine
 * (tecla **F2**: câmera de voo livre, gizmo, hierarquia e inspector) — sem nenhuma
 * linha aqui. No build de produção o editor nem entra no bundle, então não pesa
 * no jogo final (ver ADR-0042).
 *
 * O jogo só precisa: criar o `Game`, popular `game.scene`, registrar lógica em
 * `game.onUpdate(...)` (e/ou sistemas em `game.world`) e chamar `start()`. Conforme
 * o jogo cresce, mova a montagem da cena pra `scenes/` e a lógica pra `systems/`.
 */
import {
  Game,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  Color,
  Fog,
  Water,
  setupOutdoorLighting,
  placeOnGround,
} from 'cortex-game-engine'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const game = new Game({ canvas })
const three = game.scene.getThreeScene()

// ─── Céu + névoa ──────────────────────────────────────────────────────────────
const SKY = 0x9fd6ee
three.background = new Color(SKY)
three.fog = new Fog(SKY, 60, 220)

// ─── Iluminação (preset exterior do engine) ───────────────────────────────────
// Tone mapping cinematográfico + soft shadows + sol/hemisphere/ambient. Retorna
// as luzes pra ajuste. Excluir um objeto do shadowMap: setShadows(obj, {castShadow:false}).
const lights = setupOutdoorLighting(game.renderer, game.scene, { sky: SKY })
lights.sun.intensity = 3.0

// ─── Água (cartoon, com cáusticas animadas) ───────────────────────────────────
const water = new Water(game.scene, {
  y: -0.4,
  color: 0x70d6ea,
  causticsUrl: 'assets/textures/caustics.png',
  repeat: 5,
  causticsIntensity: 0.35,
  flowSpeed: [0.012, 0.007],
})

// ─── Ilha ──────────────────────────────────────────────────────────────────────
// placeOnGround assenta a BASE em y=-1 (afundada na água) e devolve as bordas/topo
// reais — use `island.topY` pra apoiar coisas em cima, sem chutar alturas.
const island = new Mesh(
  new CylinderGeometry(6, 6.5, 2, 32),
  new MeshStandardMaterial({ color: 0x6ab150, roughness: 1 }),
)
island.castShadow = true
island.receiveShadow = true
island.name = 'Island'
game.scene.add(island)
const islandBounds = placeOnGround(island, { y: -1 })

// ─── Cubo (apoiado no topo da ilha) ───────────────────────────────────────────
const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: 0x4ec9b0 }),
)
cube.castShadow = true
cube.receiveShadow = true
cube.name = 'Cube'
game.scene.add(cube)
placeOnGround(cube, { x: 0, z: 0, y: islandBounds.topY })

// ─── Lógica por frame ─────────────────────────────────────────────────────────
game.onUpdate((dt) => {
  water.update(dt) // anima as cáusticas
})

game.start()
