import { CUPS, WORLDS, PHASES_PER_WORLD, type CupId, type WorldId } from '../utils/constants'
import { isPhaseUnlocked, loadSave } from '../utils/save'
import { createMenuNav } from './menuNav'

export interface CupSelection {
  cup: CupId
  world: WorldId
  phase: number
}

export type CupSelectResult =
  | { action: 'next', selection: CupSelection }
  | { action: 'back' }

export function showCupSelect(): Promise<CupSelectResult> {
  return new Promise((resolve) => {
    const data = loadSave()
    let cup: CupId = '50cc'
    let world: WorldId = 0

    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <h1>🏆 ESCOLHA O CAMPEONATO</h1>

      <h2>Cilindrada</h2>
      <div class="grid" id="cups"></div>

      <h2>Mundo</h2>
      <div class="grid" id="worlds"></div>

      <h2>Fase</h2>
      <p style="font-size:13px;color:#9ad0ff;">Fases destravam ao terminar a anterior em até 3º lugar.</p>
      <div class="grid" id="phases"></div>

      <div class="btn-row" style="margin-top:16px;">
        <button class="btn secondary nav-item" id="back">← VOLTAR</button>
      </div>
    `
    document.body.appendChild(overlay)

    const cupsEl   = overlay.querySelector<HTMLDivElement>('#cups')!
    const worldsEl = overlay.querySelector<HTMLDivElement>('#worlds')!
    const phasesEl = overlay.querySelector<HTMLDivElement>('#phases')!

    const finish = (r: CupSelectResult) => { nav.stop(); overlay.remove(); resolve(r) }

    const renderPhases = () => {
      phasesEl.innerHTML = ''
      for (let i = 0; i < PHASES_PER_WORLD; i++) {
        const unlocked = isPhaseUnlocked(data, cup, world, i)
        const rec = data.progress[cup][world][i]
        const card = document.createElement('div')
        card.className = 'card' + (unlocked ? ' nav-item' : ' locked')
        const time = rec.bestTimeMs ? `${(rec.bestTimeMs / 1000).toFixed(2)}s` : '—'
        const pos = rec.bestPosition ? `${rec.bestPosition}º` : '—'
        card.innerHTML = `
          <h3>${unlocked ? '' : '🔒 '}Fase ${i + 1}</h3>
          <div style="font-size:12px;opacity:.7;">Melhor: ${pos} • ${time}</div>
        `
        if (unlocked) {
          card.addEventListener('click', () => {
            finish({ action: 'next', selection: { cup, world, phase: i } })
          })
        }
        phasesEl.appendChild(card)
      }
      nav.focusFirst()
    }

    CUPS.forEach((c) => {
      const card = document.createElement('div')
      card.className = 'card nav-item' + (c.id === cup ? ' selected' : '')
      card.innerHTML = `<h3>${c.label}</h3><div style="font-size:12px;opacity:.7;">Velocidade ${c.maxSpeed}</div>`
      card.addEventListener('click', () => {
        cup = c.id
        cupsEl.querySelectorAll('.card').forEach((x) => x.classList.remove('selected'))
        card.classList.add('selected')
        renderPhases()
      })
      cupsEl.appendChild(card)
    })

    WORLDS.forEach((w) => {
      const card = document.createElement('div')
      card.className = 'card nav-item' + (w.id === world ? ' selected' : '')
      card.innerHTML = `<h3>${w.name}</h3>`
      card.style.background = '#' + w.skyColor.toString(16).padStart(6, '0')
      card.style.color = '#10141c'
      card.addEventListener('click', () => {
        world = w.id
        worldsEl.querySelectorAll('.card').forEach((x) => x.classList.remove('selected'))
        card.classList.add('selected')
        renderPhases()
      })
      worldsEl.appendChild(card)
    })

    overlay.querySelector<HTMLButtonElement>('#back')!.addEventListener('click', () =>
      finish({ action: 'back' }))

    const nav = createMenuNav({
      items: () => Array.from(overlay.querySelectorAll<HTMLElement>('.nav-item')),
      onBack: () => finish({ action: 'back' }),
    })
    renderPhases()
    nav.start()
  })
}
