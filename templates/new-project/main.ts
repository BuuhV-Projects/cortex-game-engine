/**
 * Bootstrap — jogo 3D em **primeira pessoa** (FPS).
 *
 * A cena é DADO (`scenes/level.json`): um nó `terrain` (terreno colidível,
 * esculpível no editor) e o `player` — um nó `character` (cápsula com gravidade/
 * pulo). `setupFirstPerson` liga a câmera/controle FPS: **clique no canvas** trava
 * o cursor (mouse-look), **WASD** anda, **Espaço** pula. A física vertical do
 * player (cair/aterrar no terreno) o `buildScene` liga sozinho (nó `character`).
 * Em DEV o editor F2 vem ligado; em produção não pesa (ADR-0042). Lógica de jogo
 * continua em TS.
 */
import { Game, buildScene, setupFirstPerson, SceneLoader, type SceneDefinition } from 'cortex-game-engine'
import level from './scenes/level.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const game = new Game({ canvas })

// Câmera/controle de 1ª pessoa: mouse-look (clique p/ travar o cursor) + WASD + pulo.
const { camera } = setupFirstPerson(game, { camera: { moveSpeed: 6, eyeHeight: 1.6 } })
// Ajustes: camera mira o player automaticamente. Ex.: camera.pauseWhen = () => ...
void camera

game.start()

// Overlay do editor (F2): edições salvas em assets/scene-data.json (null se não houver).
const overlay = await new SceneLoader().loadSceneFile('assets/scene-data.json')

// `world` faz os nós com física (player `character` / terrain) virarem entidades ECS.
// `matte: true` deixa os modelos FOSCOS (look cartoon/desenho, mata o brilho PBR
// dos .glb stylized) — remova pra PBR brilhoso. No editor (F2) dá pra ligar/
// desligar por objeto na seção Material.
await buildScene(game.scene, [level] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  overlay,
  matte: true,
  // Pausa a física do player (cápsula `character`) enquanto o editor (F2) está
  // ativo — senão ele cai/treme e o autosave fica salvando em loop ao editar.
  physicsPaused: () => game.editorActive || game.gameplayPaused,
})
