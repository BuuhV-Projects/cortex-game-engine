import { isAnyPadConnected } from '../utils/gamepad'
import { ensureAudioRunning } from '../utils/engineAudio'
import { showSettings } from './settingsScreen'
import { createMenuNav } from './menuNav'

export interface MenuResult {
  players: 1 | 2
}

export function showMenu(): Promise<MenuResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <h1>🏁 CORRIDA MALUCA 🏁</h1>
      <p>3 cilindradas, 2 mundos, 10 fases. Customize seu carro na garagem.</p>
      <p style="margin-top:8px;font-size:13px;color:#9ad0ff;" id="pad-status">
        ${isAnyPadConnected() ? '🎮 Joystick Xbox detectado!' : 'Conecte um joystick Xbox para a melhor experiência.'}
      </p>
      <h2 style="margin-top:24px">Quantos jogadores?</h2>
      <div class="btn-row">
        <button class="btn nav-item" data-p="1">1 JOGADOR</button>
        <button class="btn nav-item" data-p="2">2 JOGADORES (COOP)</button>
      </div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn secondary nav-item" id="settings">⚙ CONFIGURAÇÕES</button>
      </div>
      <p style="margin-top:24px;font-size:12px;color:#666;">
        Menus — teclado: setas + Enter | joystick: D-Pad + A (B volta)
      </p>
      <p style="margin-top:6px;font-size:12px;color:#666;">
        Corrida — solo: setas ou WASD | 2P: P1 = WASD, P2 = setas | ou joysticks Xbox 1 e 2
      </p>
    `
    document.body.appendChild(overlay)

    const nav = createMenuNav({
      items: () => Array.from(overlay.querySelectorAll<HTMLElement>('.nav-item')),
    })
    nav.start()

    overlay.querySelectorAll<HTMLButtonElement>('button[data-p]').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Primeiro clique do usuário — destrava o AudioContext (auto-play policy)
        ensureAudioRunning()
        const players = Number(btn.dataset.p) as 1 | 2
        nav.stop()
        overlay.remove()
        resolve({ players })
      })
    })

    overlay.querySelector<HTMLButtonElement>('#settings')!.addEventListener('click', async () => {
      nav.stop()
      overlay.style.display = 'none'
      await showSettings()
      overlay.style.display = ''
      nav.start()
    })
  })
}
