/**
 * Bootstrap fino: abre o menu, espera a escolha do jogador, monta a
 * MainScene com os bindings escolhidos (e o save, se for "continuar"),
 * dispara o loop.
 *
 * "Voltar ao menu" durante o jogo recarrega a página — caminho mais
 * robusto pra liberar recursos (WebGL context, AudioListener, listeners
 * de input). O save persiste no localStorage.
 */
import { GameLoop } from 'cortex-game-engine'
import { setupMainScene, buildHud } from './scenes/MainScene'
import { showMenu } from './scenes/MenuScene'

async function main(): Promise<void> {
  const choice = await showMenu()
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const hud = buildHud()
  const { world, scene, renderer, camera } = await setupMainScene(canvas, hud, {
    bindings: choice.bindings,
    save: choice.type === 'continue' ? choice.save : undefined,
    onExitToMenu: () => {
      location.reload()
    },
  })
  const threeScene = scene.getThreeScene()

  const loop = new GameLoop({
    onUpdate(deltaTime) {
      world.tick(deltaTime)
      renderer.render(threeScene, camera)
    },
  })
  loop.start()
}

void main()
