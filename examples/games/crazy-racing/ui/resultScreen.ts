import type { Entity } from 'cortex-game-engine'
import { RaceProgressComponent } from '../components/RaceProgressComponent'
import { createMenuNav } from './menuNav'

export type RaceAction = 'retry' | 'next' | 'menu'

export interface RaceResult {
  action: RaceAction
}

export function showResults(
  cars: Entity[],
  playerEntities: Entity[],
): Promise<RaceResult> {
  return new Promise((resolve) => {
    const sorted = [...cars].sort((a, b) =>
      a.getComponent(RaceProgressComponent)!.position -
      b.getComponent(RaceProgressComponent)!.position,
    )

    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    const rows = sorted.map((e) => {
      const rp = e.getComponent(RaceProgressComponent)!
      const isPlayer = playerEntities.includes(e)
      const time = rp.finishTimeMs
        ? `${(rp.finishTimeMs / 1000).toFixed(2)}s`
        : 'não terminou'
      return `
        <tr style="color:${isPlayer ? '#ffd23f' : '#fff'}">
          <td style="padding:6px 12px;">${rp.position}º</td>
          <td style="padding:6px 12px;">${rp.label}</td>
          <td style="padding:6px 12px;">${time}</td>
        </tr>
      `
    }).join('')

    overlay.innerHTML = `
      <h1>🏁 RESULTADO</h1>
      <table style="background:#16213a;border-radius:10px;border-collapse:collapse;margin:16px 0;">
        <thead><tr style="color:#9ad0ff;">
          <th style="padding:6px 12px;">Pos</th>
          <th style="padding:6px 12px;">Piloto</th>
          <th style="padding:6px 12px;">Tempo</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="btn-row">
        <button class="btn secondary nav-item" id="retry">REPETIR</button>
        <button class="btn nav-item" id="next">PRÓXIMA FASE</button>
        <button class="btn secondary nav-item" id="menu">MENU PRINCIPAL</button>
      </div>
    `
    document.body.appendChild(overlay)
    const finish = (action: RaceAction) => { nav.stop(); overlay.remove(); resolve({ action }) }
    overlay.querySelector<HTMLButtonElement>('#retry')!.addEventListener('click', () => finish('retry'))
    overlay.querySelector<HTMLButtonElement>('#next')! .addEventListener('click', () => finish('next'))
    overlay.querySelector<HTMLButtonElement>('#menu')! .addEventListener('click', () => finish('menu'))

    const nav = createMenuNav({
      items: () => Array.from(overlay.querySelectorAll<HTMLElement>('.nav-item')),
      onBack: () => finish('next'),
    })
    nav.start()
  })
}
