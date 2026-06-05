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
 *
 * Já vem com o MODO EDITOR embutido do engine ligado (tecla F2): câmera de voo
 * livre + gizmo pra posicionar objetos estilo Blender/Unity. Use-o pra montar
 * fases — NÃO reimplemente navegação/edição de cena à mão.
 */
import {
  World,
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
  InputManager,
  TransformComponent,
  Object3DComponent,
  EditableTargetComponent,
  Object3DSyncSystem,
  createEditorState,
  createEditorHud,
  EditorCameraSystem,
  ObjectEditSystem,
} from 'cortex-game-engine'

// ─── Setup ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const world = new World()
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
ground.name = 'Ground'
scene.add(ground)

// ─── Cubo central (avatar editável) ───────────────────────────────────────────
// O cubo é uma entidade ECS marcada como EditableTargetComponent — é o "avatar"
// que o modo editor pode teleportar (T). Object3DSyncSystem mantém a mesh
// alinhada ao TransformComponent a cada frame.
const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: 0x4ec9b0 }),
)
cube.name = 'Cube'
scene.add(cube)

const player = world.createEntity()
const playerTransform = new TransformComponent(0, 0.5, 0) // apoiado em cima do chão
player.addComponent(playerTransform)
player.addComponent(new Object3DComponent(cube))
player.addComponent(new EditableTargetComponent())

world.addSystem(new Object3DSyncSystem())

// ─── Modo editor embutido (tecla F2) ──────────────────────────────────────────
// O engine traz um editor estilo Blender/Unity, pronto pra montar fases:
//   F2            liga/desliga o editor
//   WASD/QE       voa com a câmera livre (Shift = correr)
//   botão direito olha em volta
//   clique        seleciona um objeto da cena;  1/2/3 = mover/rotacionar/escalar
//   F             enquadra o objeto selecionado;  T = teleporta o avatar (cubo)
//   P             salva as edições (callback abaixo) — persista como quiser
// Estenda ESTE editor pra autoria de cenário; não reimplemente câmera/gizmo.
const input = new InputManager()
input.attach(document.body)

const editorState = createEditorState()
const editorHud = createEditorHud()

// Câmera separada usada só no modo editor (voo livre). A do jogo fica intacta.
const editorCamera = new PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
)

const editorCameraSystem = new EditorCameraSystem(
  editorState,
  editorCamera,
  camera,
  input,
  ground, // raycast de teleporte faz snap nesta superfície
  editorHud,
)
world.addSystem(editorCameraSystem)

world.addSystem(
  new ObjectEditSystem(
    editorState,
    editorCamera,
    canvas,
    scene,
    [three], // raiz editável: qualquer objeto nomeado da cena pode ser selecionado
    input,
    editorHud,
    // onSaveEdits: aqui só notifica; persista em JSON (SceneFileWriter) quando quiser.
    (edits) => {
      editorHud.showToast(`${Object.keys(edits).length} objeto(s) salvos`)
      console.log('[editor] edits', edits)
    },
    // onClearEdits
    () => editorHud.showToast('Edições limpas'),
    undefined, // onTransformChange (sync de volta pro ECS) — não necessário aqui
    // onFocusRequest: F enquadra o objeto selecionado, estilo Blender.
    (obj) => editorCameraSystem.focusOn(obj),
  ),
)

// ─── Loop principal ───────────────────────────────────────────────────────────

const loop = new GameLoop({
  onUpdate(deltaTime: number) {
    const dt = deltaTime / 1000
    // Gira o cubo devagar só pra mostrar que está rodando — pausa no editor.
    if (!editorState.active) {
      playerTransform.rotationY += 0.6 * dt
    }
    world.tick(deltaTime) // editor (câmera/gizmo) + Object3DSyncSystem rodam aqui
    // No editor renderiza pela câmera de voo livre; senão, pela câmera do jogo.
    renderer.render(scene.getThreeScene(), editorState.active ? editorCamera : camera)
  },
})

loop.start()
