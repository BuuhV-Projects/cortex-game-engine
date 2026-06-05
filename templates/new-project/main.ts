/**
 * Bootstrap do projeto — cena **data-driven**.
 *
 * A cena é DADO (arquivos JSON em `scenes/`), não código imperativo: o
 * `buildScene` instancia os nós (modelos `.glb`, luzes, água, primitivas). Isso
 * deixa o editor (F2, em dev) editar/remover/adicionar e SALVAR de volta sem
 * desperdício — o loader é o único ponto de instanciação, então objeto removido
 * nunca é criado. Lógica de jogo continua em TS (`systems/`, `components/`).
 *
 * Os JSON são **importados** (não buscados em runtime), então o Vite os bundla no
 * build — multi-arquivo em dev, bundle único no build. Em DEV o editor F2 já vem
 * ligado pelo engine; em produção o editor não entra no bundle (ADR-0042).
 */
import { Game, buildScene, type SceneDefinition } from 'cortex-game-engine'
import world from './scenes/world.json'
import props from './scenes/props.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

const game = new Game({ canvas })
game.start()

// Cast: o tipo inferido do import de JSON é estrutural, não a união discriminada
// `SceneDefinition` — o conteúdo é validado em runtime pelo schema (zod).
const scene = await buildScene(game.scene, [world, props] as unknown as SceneDefinition[], {
  renderer: game.renderer,
})

game.onUpdate((dt) => {
  scene.update(dt) // anima as cáusticas da água
})
