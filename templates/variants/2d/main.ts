/**
 * Bootstrap — jogo **2D / pixel art**. Câmera **ortográfica** (sem perspectiva) +
 * `pixelsPerUnit` (zoom). A cena inicial usa primitivas (retângulos coloridos) só
 * pra rodar de cara; troque por **sprites** e **tilemap** (ver blocos comentados).
 *
 * A física é a mesma do plataformer: `setupPlatformer` liga gravidade + colisão
 * AABB, input (←/→ anda, Espaço/↑ pula) e a câmera 2D que segue o player. Em DEV
 * o editor (▶ Play/Stop) vem ligado; em produção não pesa.
 */
import {
  Game,
  buildScene,
  setupPlatformer,
  SceneLoader,
  type SceneDefinition,
  // ── Pixel art (descomente conforme for usando) ──────────────────────────────
  // AssetLoader, createSprite, Spritesheet, createAnimatedSprite,
  // SpriteAnimationSystem, Object3DComponent, buildTilemap,
} from 'cortex-game-engine'
import level from './scenes/level.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

// `projection: 'orthographic'` = 2D puro. `pixelsPerUnit` = px de tela por unidade
// de mundo (zoom): 32 = 1 unidade ocupa 32px. Sprites de 16px → 0.5 unidade.
const game = new Game({ canvas, projection: 'orthographic', pixelsPerUnit: 32 })

setupPlatformer(game, { camera: { distance: 16, responsiveness: 8 } })

game.start()

const overlay = await new SceneLoader().loadSceneFile('assets/scene-data.json')
await buildScene(game.scene, [level] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  overlay,
})

// ── Sprite animado (exemplo) ───────────────────────────────────────────────────
// const loader = new AssetLoader()
// const tex = await loader.loadTexture('assets/hero.png', { pixelated: true })
// const sheet = new Spritesheet(tex, { frameWidth: 16, frameHeight: 16 })
// const { sprite, animation } = createAnimatedSprite(sheet, {
//   idle: { frames: [0, 1], fps: 4 },
//   run: { frames: [2, 3, 4, 5], fps: 12 },
// }, { pixelsPerUnit: 32, initial: 'idle' })
// game.scene.add(sprite)
// const e = game.world.createEntity()
// e.addComponent(new Object3DComponent(sprite))
// e.addComponent(animation)
// game.world.addSystem(new SpriteAnimationSystem())
// // troque a animação: animation.play('run')

// ── Tilemap (exemplo) ──────────────────────────────────────────────────────────
// const tiles = await new AssetLoader().loadTexture('assets/tiles.png', { pixelated: true })
// const map = buildTilemap({
//   tileset: tiles, tileWidth: 16, tileHeight: 16, tileSize: 1,
//   data: [
//     [-1, -1, -1],
//     [ 0,  0,  0],
//     [ 1,  2,  1],
//   ],
// })
// game.scene.add(map.mesh)
// map.addColliders(game.world) // chão sólido
