/**
 * Bootstrap — jogo de **plataforma 2.5D** (estilo Rayman/Mario Wonder).
 *
 * A cena é DADO (`scenes/level.json`): nós `primitive`/`model` viram plataformas
 * (campo `collider`) e o `player` (campo `player`). `setupPlatformer` liga a
 * física (gravidade + colisão AABB), o input (←/→ anda, Espaço/↑ pula) e a câmera
 * 2D que segue o player no plano XY (sobe/desce/lados). Em DEV o editor F2 vem
 * ligado; em produção não pesa (ADR-0042). Lógica de jogo continua em TS.
 */
import { Game, buildScene, setupPlatformer, SceneLoader, type SceneDefinition } from 'cortex-game-engine'
import level from './scenes/level.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const game = new Game({ canvas })

// Física + input + câmera 2D-follow (offset/distância/roll-Z opcional).
const { followCamera } = setupPlatformer(game, { camera: { distance: 16, responsiveness: 6 } })
// Pra dar o leve giro 2.5D estilo Rayman, descomente (em radianos):
// followCamera.setRoll(0.05)
void followCamera

game.start()

// Overlay do editor (F2): edições salvas em assets/scene-data.json (null se não houver).
const overlay = await new SceneLoader().loadSceneFile('assets/scene-data.json')

// `world` faz os nós com collider/player virarem entidades ECS (física/câmera).
await buildScene(game.scene, [level] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  overlay,
})
