/**
 * Bootstrap — jogo 3D em **terceira pessoa** (StarterAssets-like).
 *
 * A cena é DADO (`scenes/level.json`): um nó `terrain` (terreno colidível,
 * esculpível no editor) e o `player` — um `model` `.glb` rigado com clipes,
 * marcado `character` (cápsula com gravidade/pulo). `setupThirdPerson` liga a
 * câmera orbital + controle: **clique no canvas** trava o cursor (mouse orbita),
 * **WASD** anda relativo à câmera, **Shift** corre, **Espaço** pula; o personagem
 * vira pra direção do movimento e anima (idle/walk/run/jump/fall). A física
 * vertical o `buildScene` liga sozinho (nó `character`). Em DEV o editor F2 vem
 * ligado; em produção não pesa (ADR-0042). Lógica de jogo continua em TS.
 */
import {
  Game,
  buildScene,
  createLoadingScreen,
  setupThirdPerson,
  SceneLoader,
  registerScripts,
  ScriptHostSystem,
  type SceneDefinition,
} from 'cortex-game-engine'
import level from './scenes/level.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const game = new Game({ canvas })

// Scripts anexáveis (ADR-0085): TODO arquivo em `scripts/` é auto-registrado —
// o nome no Inspector ("Adicionar Componente → Script") é o nome do ARQUIVO
// (estilo Unity; `static scriptName` na classe sobrepõe). Crie o arquivo e pronto.
registerScripts(import.meta.glob('./scripts/*.ts', { eager: true }))
game.world.addSystem(
  // Os dois gates são DIFERENTES (ADR-0184): `isEditing` derruba as instâncias
  // dos scripts (Play↔Stop do editor); `isPaused` só congela, preservando o
  // estado. Pausa de jogo — cutscene, menu — vai sempre no segundo.
  new ScriptHostSystem(
    { world: game.world, input: game.input, gamepad: game.gamepad, scene: game.scene, camera: game.camera },
    { isEditing: () => game.editorActive, isPaused: () => game.gameplayPaused },
  ),
)

// Câmera/controle de 3ª pessoa (porta do Unity StarterAssets ThirdPerson): mouse
// orbita (clique p/ travar o cursor), WASD relativo à câmera, Shift corre, Espaço
// pula. `facingOffset: π` porque o mannequin nasce virado ao contrário (faces +Z).
const { control } = setupThirdPerson(game, {
  control: { moveSpeed: 2, sprintSpeed: 5.335, facingOffset: Math.PI },
})
// Ajustes: control.moveSpeed / sprintSpeed / cameraDistance…
void control

// Teto de fps é escolha do JOGO (ADR-0257). Quadro constante lê mais fluido que
// uma taxa maior que oscila; prefira um divisor do refresh do monitor
// (`game.refreshHz`: num de 75 Hz, 75 ou 37,5). Sem teto por padrão.
// game.maxFps = 60

game.start()

// ── Carregamento (SPEC-0268) ────────────────────────────────────────────────
// Monta TUDO sob a tela de carregamento e aquece os shaders antes de liberar o
// jogo. Sem isso o jogador vê a cena montando pela metade e cada material
// compila na primeira vez que aparece — travadas de 50 a 175 ms num quadro,
// medidas no kart-racer. `setLoading` faz o Game desenhar só a UI por cima de
// uma cena vazia; a tela de carregamento é opaca e esconde o quadro de
// aquecimento. No editor (F2) ela não aparece: editar um script recarrega a
// página, e um overlay a cada reload só atrapalha.
game.setLoading(true)
const loading = createLoadingScreen(game.ui, { message: 'Carregando…' })
if (!game.editorActive) loading.show()

let scene: Awaited<ReturnType<typeof buildScene>>
try {
  // Overlay do editor (F2): edições salvas em assets/scene-data.json (null se não houver).
  const overlay = await new SceneLoader().loadSceneFile('assets/scene-data.json')

  // `world` faz os nós com física (player `character` / terrain) virarem entidades ECS.
  // `matte: true` deixa os modelos FOSCOS (look cartoon/desenho, mata o brilho PBR
  // dos .glb stylized); o player tem `matte: false` no JSON pra manter a textura PBR.
  // No editor (F2) dá pra ligar/desligar por objeto na seção Material.
  scene = await buildScene(game.scene, [level] as unknown as SceneDefinition[], {
    renderer: game.renderer,
    world: game.world,
    overlay,
    matte: true,
    // O `game.precompile()` lá embaixo aquece a cena inteira do jeito certo; o
    // aquecimento do próprio build levaria segundos no export (um objeto por
    // quadro) e compilaria a variante errada dos transparentes (ADR-0262).
    precompile: false,
    onProgress: (p) => loading.setProgress('Carregando…', p.fraction),
    // Pausa a física do player (cápsula `character`) enquanto o editor (F2) está
    // ativo — senão ele cai/treme e o autosave fica salvando em loop ao editar.
    physicsPaused: () => game.editorActive || game.gameplayPaused,
  })

  // ▸ Crie AQUI o que o jogo só cria no uso — efeitos, projéteis, inimigos que
  //   aparecem depois, variantes. Objeto que nasce no meio do jogo compila shader
  //   na hora e trava. Use pool: crie no carregamento e reaproveite.

  // Aquece os shaders com um quadro de verdade (a cena inteira visível) e coleta
  // o lixo do carregamento — tudo sob a tela, antes do jogador ver o primeiro quadro.
  await game.precompile()
} finally {
  loading.destroy()
  game.setLoading(false)
}

// Tica animações (mixer do SceneAnimator) + água/parallax todo frame. SEM isto o
// personagem não anima (idle/walk/run/jump ficam congelados).
game.onUpdate((dt) => scene.update(dt))
