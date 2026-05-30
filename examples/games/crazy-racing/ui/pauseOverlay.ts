import { createMenuNav } from './menuNav'

export type PauseAction = 'resume' | 'restart' | 'menu'

/**
 * Overlay de pausa. Pra evitar reentrância (segurar Start emitir várias
 * pausas) o caller deve ignorar novos sinais de pause enquanto a promise
 * não resolve.
 */
export function showPause(): Promise<PauseAction> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.style.background = 'rgba(16,20,28,.78)'
    overlay.innerHTML = `
      <h1>⏸ PAUSADO</h1>
      <p>A corrida está pausada. Escolha uma opção.</p>
      <div class="btn-row" style="flex-direction:column;align-items:stretch;min-width:260px;">
        <button class="btn nav-item" id="resume">CONTINUAR</button>
        <button class="btn secondary nav-item" id="restart">REINICIAR CORRIDA</button>
        <button class="btn secondary nav-item" id="menu">MENU PRINCIPAL</button>
      </div>
    `
    document.body.appendChild(overlay)

    const finish = (a: PauseAction) => { nav.stop(); overlay.remove(); resolve(a) }

    overlay.querySelector<HTMLButtonElement>('#resume')! .addEventListener('click', () => finish('resume'))
    overlay.querySelector<HTMLButtonElement>('#restart')!.addEventListener('click', () => finish('restart'))
    overlay.querySelector<HTMLButtonElement>('#menu')!   .addEventListener('click', () => finish('menu'))

    const nav = createMenuNav({
      items: () => Array.from(overlay.querySelectorAll<HTMLElement>('.nav-item')),
      onBack: () => finish('resume'),
    })
    nav.start()
  })
}
