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
  SceneEditor,
} from 'cortex-game-engine'
import type { Camera } from 'cortex-game-engine'

// ─── Setup ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const scene = new Scene()

const renderer = new Renderer({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
})

const gameCamera = new PerspectiveCamera(
  75,                                      // field of view (graus)
  window.innerWidth / window.innerHeight,  // aspect ratio
  0.1,                                     // near plane
  1000,                                    // far plane
)
gameCamera.position.z = 5

// Câmera ativa de renderização — trocada pelo SceneEditor quando ativo.
let activeCamera: Camera = gameCamera

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
cube.name = 'cube'   // nome aparece no inspector do SceneEditor
scene.add(cube)

// ─── Scene Editor (ADR-0026 Fase 1) ──────────────────────────────────────────
//
// Modo edit-in-place: tecle F8 pra entrar/sair, ou dispare a partir do
// botão Editar/Play do Preview da IDE (postMessage). Em modo editor:
//   - OrbitControls (drag pra orbitar, scroll pra zoom)
//   - Clique seleciona mesh
//   - W=translate, E=rotate, R=scale, Esc=desselecionar
//   - Sidebar mostra Transform editável + botão "Copy as code"
// Não muda runtime do jogo — render do loop usa a câmera ativa.

const sceneEditor = new SceneEditor({
  renderer,
  scene: scene.getThreeScene(),
  gameCamera,
  onCameraChange: (camera) => { activeCamera = camera },
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'F8') sceneEditor.toggle()
})

// ─── Loop principal ───────────────────────────────────────────────────────────

const loop = new GameLoop({
  onUpdate(deltaTime: number) {
    const dt = deltaTime / 1000

    if (sceneEditor.isEnabled()) {
      sceneEditor.update()              // damping dos OrbitControls
    } else {
      cube.rotation.x += 0.6 * dt        // gameplay roda só em Play
      cube.rotation.y += 0.9 * dt
    }

    renderer.render(scene.getThreeScene(), activeCamera)
  },
})

loop.start()
