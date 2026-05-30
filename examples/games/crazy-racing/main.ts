/**
 * Bootstrap: state machine simples MENU → GARAGE → CUP → RACE.
 * Cada tela pode retornar 'back' pra voltar ao passo anterior; o RaceScene
 * cria e destrói World/Renderer a cada partida.
 */
import { injectStyles } from './ui/styles'
import { showMenu } from './ui/menuScreen'
import { showGarage } from './ui/garageScreen'
import { showCupSelect } from './ui/cupSelectScreen'
import { runRace } from './scenes/RaceScene'
import type { PlayerCustomization } from './utils/constants'

type Step = 'menu' | 'garage' | 'cup' | 'race'

async function main(): Promise<void> {
  injectStyles()

  let step: Step = 'menu'
  let players: 1 | 2 = 1
  let customizations: PlayerCustomization[] = []
  let selection: { cup: import('./utils/constants').CupId; world: import('./utils/constants').WorldId; phase: number } | null = null

  // Loop infinito de telas — cada estado decide o próximo
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (step === 'menu') {
      const r = await showMenu()
      players = r.players
      step = 'garage'
    } else if (step === 'garage') {
      const r = await showGarage(players)
      if (r.action === 'back') { step = 'menu'; continue }
      customizations = r.customizations
      step = 'cup'
    } else if (step === 'cup') {
      const r = await showCupSelect()
      if (r.action === 'back') { step = 'garage'; continue }
      selection = r.selection
      step = 'race'
    } else if (step === 'race' && selection) {
      const outcome = await runRace({
        cup: selection.cup,
        world: selection.world,
        phase: selection.phase,
        players: customizations,
      })
      if (outcome.action === 'menu') {
        location.reload()
        return
      }
      // 'retry' fica em race, 'next' volta pra cup-select
      if (outcome.action === 'next') step = 'cup'
    }
  }
}

main().catch((err) => {
  console.error(err)
  document.body.innerHTML = `<pre style="color:red;padding:20px">${err.stack ?? err}</pre>`
})
