import {
  CAR_COLORS, CAR_MODELS, WHEEL_SIZES, WHEEL_TYPES,
  type PlayerCustomization,
} from '../utils/constants'
import { loadSave, saveAll } from '../utils/save'
import { createMenuNav } from './menuNav'

export type GarageResult =
  | { action: 'next', customizations: PlayerCustomization[] }
  | { action: 'back' }

export function showGarage(playerCount: 1 | 2): Promise<GarageResult> {
  return new Promise((resolve) => {
    const data = loadSave()
    const current: PlayerCustomization[] = [
      { ...data.customization[0] },
      { ...data.customization[1] },
    ]

    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <h1>🔧 GARAGEM</h1>
      <p>Escolha carro, cor, tipo e tamanho de roda para cada jogador.</p>
      <div class="row" id="panels"></div>
      <div class="btn-row">
        <button class="btn secondary nav-item" id="back">← VOLTAR</button>
        <button class="btn nav-item" id="confirm">PRÓXIMO →</button>
      </div>
    `
    document.body.appendChild(overlay)

    const panels = overlay.querySelector<HTMLDivElement>('#panels')!
    for (let i = 0; i < playerCount; i++) {
      panels.appendChild(buildPanel(i, current[i], () => {
        data.customization[i as 0 | 1] = current[i]
        saveAll(data)
      }))
    }

    const finish = (r: GarageResult) => { nav.stop(); overlay.remove(); resolve(r) }
    const nav = createMenuNav({
      items: () => Array.from(overlay.querySelectorAll<HTMLElement>('.nav-item')),
      onBack: () => finish({ action: 'back' }),
    })

    overlay.querySelector<HTMLButtonElement>('#back')!.addEventListener('click', () =>
      finish({ action: 'back' }))
    overlay.querySelector<HTMLButtonElement>('#confirm')!.addEventListener('click', () =>
      finish({ action: 'next', customizations: current.slice(0, playerCount) }))

    nav.start()
  })
}

function buildPanel(
  index: number,
  custom: PlayerCustomization,
  onChange: () => void,
): HTMLDivElement {
  const panel = document.createElement('div')
  panel.className = 'player-panel'
  panel.innerHTML = `
    <h2>Jogador ${index + 1}</h2>

    <h3>Carro</h3>
    <div class="grid" data-section="model"></div>

    <h3>Cor</h3>
    <div data-section="color" style="display:flex;flex-wrap:wrap;justify-content:center;"></div>

    <h3>Tipo de roda</h3>
    <div class="grid" data-section="wheel-type"></div>

    <h3>Tamanho da roda</h3>
    <div class="grid" data-section="wheel-size"></div>
  `

  // Modelo
  const modelEl = panel.querySelector<HTMLDivElement>('[data-section=model]')!
  CAR_MODELS.forEach((m) => {
    const card = document.createElement('div')
    card.className = 'card nav-item' + (custom.carModel === m ? ' selected' : '')
    card.textContent = m.toUpperCase()
    card.addEventListener('click', () => {
      custom.carModel = m
      modelEl.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'))
      card.classList.add('selected')
      onChange()
    })
    modelEl.appendChild(card)
  })

  // Cor
  const colorEl = panel.querySelector<HTMLDivElement>('[data-section=color]')!
  CAR_COLORS.forEach((c) => {
    const sw = document.createElement('span')
    sw.className = 'swatch nav-item' + (custom.color === c ? ' selected' : '')
    sw.style.background = '#' + c.toString(16).padStart(6, '0')
    sw.addEventListener('click', () => {
      custom.color = c
      colorEl.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'))
      sw.classList.add('selected')
      onChange()
    })
    colorEl.appendChild(sw)
  })

  // Tipo de roda
  const wtEl = panel.querySelector<HTMLDivElement>('[data-section=wheel-type]')!
  WHEEL_TYPES.forEach((t) => {
    const card = document.createElement('div')
    card.className = 'card nav-item' + (custom.wheelType === t ? ' selected' : '')
    card.textContent = t.toUpperCase()
    card.addEventListener('click', () => {
      custom.wheelType = t
      wtEl.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'))
      card.classList.add('selected')
      onChange()
    })
    wtEl.appendChild(card)
  })

  // Tamanho
  const wsEl = panel.querySelector<HTMLDivElement>('[data-section=wheel-size]')!
  WHEEL_SIZES.forEach((s) => {
    const card = document.createElement('div')
    card.className = 'card nav-item' + (custom.wheelSize === s ? ' selected' : '')
    card.textContent = s + 'x'
    card.addEventListener('click', () => {
      custom.wheelSize = s
      wsEl.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'))
      card.classList.add('selected')
      onChange()
    })
    wsEl.appendChild(card)
  })

  return panel
}
