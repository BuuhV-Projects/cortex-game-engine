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
import { Game, buildScene, setupThirdPerson, SceneLoader, type SceneDefinition } from 'cortex-game-engine'
import level from './scenes/level.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const game = new Game({ canvas })

// Câmera/controle de 3ª pessoa (porta do Unity StarterAssets ThirdPerson): mouse
// orbita (clique p/ travar o cursor), WASD relativo à câmera, Shift corre, Espaço
// pula. `facingOffset: π` porque o mannequin nasce virado ao contrário (faces +Z).
const { control } = setupThirdPerson(game, {
  control: { moveSpeed: 2, sprintSpeed: 5.335, facingOffset: Math.PI },
})
// Ajustes: control.moveSpeed / sprintSpeed / cameraDistance…
void control

game.start()

// Overlay do editor (F2): edições salvas em assets/scene-data.json (null se não houver).
const overlay = await new SceneLoader().loadSceneFile('assets/scene-data.json')

// `world` faz os nós com física (player `character` / terrain) virarem entidades ECS.
// `matte: true` deixa os modelos FOSCOS (look cartoon/desenho, mata o brilho PBR
// dos .glb stylized); o player tem `matte: false` no JSON pra manter a textura PBR.
// No editor (F2) dá pra ligar/desligar por objeto na seção Material.
const scene = await buildScene(game.scene, [level] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  overlay,
  matte: true,
  // Pausa a física do player (cápsula `character`) enquanto o editor (F2) está
  // ativo — senão ele cai/treme e o autosave fica salvando em loop ao editar.
  physicsPaused: () => game.editorActive || game.gameplayPaused,
})

// Tica animações (mixer do SceneAnimator) + água/parallax todo frame. SEM isto o
// personagem não anima (idle/walk/run/jump ficam congelados).
game.onUpdate((dt) => scene.update(dt))
