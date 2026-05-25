import { GameLoop, Renderer, Scene, PerspectiveCamera } from 'cortex-game-engine'

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

// ─── Loop principal ───────────────────────────────────────────────────────────

const loop = new GameLoop({
  onUpdate(_deltaTime: number) {
    renderer.render(scene.getThreeScene(), camera)
  },
})

loop.start()
