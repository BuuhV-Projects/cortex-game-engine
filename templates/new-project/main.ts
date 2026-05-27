/**
 * Bootstrap do projeto. Responsabilidades:
 *   1. Criar World, Scene, Renderer, Camera, GameLoop.
 *   2. Delegar setup da cena a `scenes/` quando o projeto crescer.
 *   3. Iniciar o loop.
 *
 * Conforme o jogo cresce, mova as criações de Mesh/luzes/entidades pra
 * `scenes/MainScene.ts` (ou similar) — main.ts deve ser fino. Components
 * em `components/`, lógica em `systems/`, factories em `entities/`.
 * Mais regras em README.md.
 */
import {
  GameLoop,
  Renderer,
  Scene,
  PerspectiveCamera,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  AmbientLight,
  DirectionalLight,
} from 'cortex-game-engine'

// ─── Setup ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const scene = new Scene()

const renderer = new Renderer({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
})

const camera = new PerspectiveCamera(
  75,                                      // field of view (graus)
  window.innerWidth / window.innerHeight,  // aspect ratio
  0.1,                                     // near plane
  1000,                                    // far plane
)
camera.position.z = 5

// ─── Iluminação ───────────────────────────────────────────────────────────────

scene.add(new AmbientLight(0xffffff, 0.4))
const dirLight = new DirectionalLight(0xffffff, 0.8)
dirLight.position.set(3, 5, 4)
scene.add(dirLight)

// ─── Objeto: cubo ─────────────────────────────────────────────────────────────

const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: 0x4ec9b0 }),
)
scene.add(cube)

// ─── Loop principal ───────────────────────────────────────────────────────────

const loop = new GameLoop({
  onUpdate(deltaTime: number) {
    const dt = deltaTime / 1000
    cube.rotation.x += 0.6 * dt
    cube.rotation.y += 0.9 * dt
    renderer.render(scene.getThreeScene(), camera)
  },
})

loop.start()
