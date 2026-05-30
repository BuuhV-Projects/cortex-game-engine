import type { Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { RaceProgressComponent } from '../components/RaceProgressComponent'
import { drawMinimap } from './minimap'
import type { TrackLayout } from '../utils/trackLayouts'

export interface MinimapPayload {
  layout: TrackLayout
  allCars: Entity[]
  playerEntities: Entity[]
}

export interface HudHandle {
  update(playerEntities: Entity[], totalLaps: number): void
  drawMinimaps(payload: MinimapPayload): void
  showCountdown(text: string): void
  hideCountdown(): void
  destroy(): void
}

const MINIMAP_SIZE = 180

export function mountHud(playerCount: 1 | 2): HudHandle {
  const containers: HTMLDivElement[] = []
  const minimaps: HTMLCanvasElement[] = []

  for (let i = 0; i < playerCount; i++) {
    const el = document.createElement('div')
    el.className = `hud hud-p${i}`
    el.innerHTML = `
      <div><span class="label">Pos</span> <span class="pos" data-pos>1/${0}</span></div>
      <div><span class="label">Volta</span> <span class="lap" data-lap>1/3</span></div>
      <div><span class="label">Km/h</span> <span class="speed" data-speed>0</span></div>
      <div style="font-size:12px;opacity:.8;"><span data-time>--</span></div>
      <div data-nitro style="display:none;margin-top:6px;">
        <div style="font-size:11px;color:#ff6b00;text-shadow:0 0 4px #ff6b00;">🔥 NITRO</div>
        <div style="width:120px;height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden;">
          <div data-nitro-bar style="height:100%;background:linear-gradient(90deg,#ffd23f,#ff6b00);width:100%;transition:width .1s;"></div>
        </div>
      </div>
    `
    document.body.appendChild(el)
    containers.push(el)

    // Minimap em canvas dedicado, posicionado por jogador
    const canvas = document.createElement('canvas')
    canvas.className = `minimap minimap-p${i}`
    canvas.width = MINIMAP_SIZE
    canvas.height = MINIMAP_SIZE
    document.body.appendChild(canvas)
    minimaps.push(canvas)
  }

  const countdown = document.createElement('div')
  countdown.className = 'countdown'
  countdown.style.display = 'none'
  document.body.appendChild(countdown)

  return {
    update(playerEntities, totalLaps) {
      playerEntities.forEach((e, i) => {
        const container = containers[i]
        if (!container) return
        const car = e.getComponent(CarComponent)!
        const rp = e.getComponent(RaceProgressComponent)!
        container.querySelector('[data-speed]')!.textContent =
          Math.round(Math.abs(car.speed) * 3.6).toString()
        container.querySelector('[data-pos]')!.textContent = `${rp.position}º`
        container.querySelector('[data-lap]')!.textContent =
          `${Math.max(1, Math.min(rp.lap, totalLaps))}/${totalLaps}`
        const t = rp.lastLapMs ? `Última: ${(rp.lastLapMs / 1000).toFixed(2)}s` : 'Boa sorte!'
        container.querySelector('[data-time]')!.textContent = t

        const nitroEl = container.querySelector<HTMLDivElement>('[data-nitro]')!
        const nitroBar = container.querySelector<HTMLDivElement>('[data-nitro-bar]')!
        if (car.nitroTimer > 0) {
          nitroEl.style.display = ''
          nitroBar.style.width = `${Math.min(100, (car.nitroTimer / 2) * 100)}%`
        } else {
          nitroEl.style.display = 'none'
        }
      })
    },
    drawMinimaps(payload) {
      minimaps.forEach((canvas, i) => {
        drawMinimap(canvas, {
          layout: payload.layout,
          allCars: payload.allCars,
          playerEntities: payload.playerEntities,
          viewportIndex: i,
        })
      })
    },
    showCountdown(text) { countdown.textContent = text; countdown.style.display = 'flex' },
    hideCountdown() { countdown.style.display = 'none' },
    destroy() {
      containers.forEach((c) => c.remove())
      minimaps.forEach((c) => c.remove())
      countdown.remove()
    },
  }
}
