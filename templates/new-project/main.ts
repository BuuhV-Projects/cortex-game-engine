/**
 * Bootstrap do projeto. Responsabilidades:
 *   1. Criar World, Scene, Renderer, Camera, GameLoop.
 *   2. Delegar setup da cena a `scenes/` quando o projeto crescer.
 *   3. Iniciar o loop.
 *
 * Começa com uma cena "starter": céu, um chão que some no horizonte (névoa) e um
 * cubo no centro — ponto de partida pra você construir em cima. Conforme o jogo
 * cresce, mova as criações de Mesh/luzes/entidades pra `scenes/MainScene.ts`
 * (ou similar) — main.ts deve ser fino. Components em `components/`, lógica em
 * `systems/`, factories em `entities/`. Mais regras em README.md.
 */
import {
  GameLoop,
  Renderer,
  Scene,
  PerspectiveCamera,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  Color,
  Fog,
  HemisphereLight,
  DirectionalLight,
} from 'cortex-game-engine'

// ─── Setup ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const scene = new Scene()
const three = scene.getThreeScene()

const renderer = new Renderer({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
})

const camera = new PerspectiveCamera(
  60,                                      // field of view (graus)
  window.innerWidth / window.innerHeight,  // aspect ratio
  0.1,                                     // near plane
  1000,                                    // far plane
)
camera.position.set(5, 4, 7)
camera.lookAt(0, 0.5, 0)

// Mantém a câmera correta quando a janela é redimensionada (o Renderer já
// ajusta o próprio tamanho sozinho).
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
})

// ─── Céu + névoa ──────────────────────────────────────────────────────────────
// Fundo azul-céu e uma névoa da MESMA cor: o chão se dissolve no horizonte,
// dando a sensação de mundo infinito. Troque a cor por um azul-mar (ex.: 0x3b6e8f)
// se quiser um "oceano" em vez de céu.
const SKY = 0x9fc6e0
three.background = new Color(SKY)
three.fog = new Fog(SKY, 30, 140)

// ─── Iluminação (exterior) ────────────────────────────────────────────────────
// HemisphereLight = luz do céu por cima + cor do chão por baixo (ambiente
// natural). DirectionalLight faz de "sol", dando volume ao cubo.
scene.add(new HemisphereLight(SKY, 0x5a5d63, 0.9))
const sun = new DirectionalLight(0xffffff, 1.2)
sun.position.set(8, 12, 6)
scene.add(sun)

// ─── Chão "infinito" ──────────────────────────────────────────────────────────
// Plano grande na horizontal; as bordas somem na névoa. Cinza neutro (estilo
// plano default da Unity). Troque a cor por verde (0x4f7a3a) pra grama ou por
// azul (0x3b6e8f) pra água.
const ground = new Mesh(
  new PlaneGeometry(500, 500),
  new MeshStandardMaterial({ color: 0x8a8d93, roughness: 1 }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

// ─── Cubo central ─────────────────────────────────────────────────────────────
const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: 0x4ec9b0 }),
)
cube.position.y = 0.5 // apoiado em cima do chão
scene.add(cube)

// ─── Loop principal ───────────────────────────────────────────────────────────

const loop = new GameLoop({
  onUpdate(deltaTime: number) {
    const dt = deltaTime / 1000
    cube.rotation.y += 0.6 * dt // gira devagar só pra mostrar que está rodando
    renderer.render(scene.getThreeScene(), camera)
  },
})

loop.start()
