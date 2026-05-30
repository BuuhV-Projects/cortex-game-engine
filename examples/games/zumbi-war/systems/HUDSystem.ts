import { System, type Entity } from 'cortex-game-engine'
import { GameStateComponent } from '../components/GameStateComponent'
import { HealthComponent } from '../components/HealthComponent'
import { WeaponComponent } from '../components/WeaponComponent'
import { PlayerComponent } from '../components/PlayerComponent'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Atualiza o DOM HUD a cada frame. Lê GameState + Player (HP, weapon).
 * Os elementos DOM são criados/injetados pela MainScene no body.
 */
export class HUDSystem extends System {
  static override requiredComponents = [GameStateComponent]

  constructor(
    private dom: {
      hp: HTMLElement
      hpBar: HTMLElement
      ammo: HTMLElement
      wave: HTMLElement
      kills: HTMLElement
      gamepad: HTMLElement
      overlay: HTMLElement
      overlayTitle: HTMLElement
      overlaySub: HTMLElement
    },
    private getPlayer: () => Entity | null,
  ) {
    super()
  }

  override update(entities: Entity[]): void {
    const player = this.getPlayer()
    const hp = player?.getComponent(HealthComponent)
    const w = player?.getComponent(WeaponComponent)
    const pc = player?.getComponent(PlayerComponent)

    if (hp) {
      const pct = Math.max(0, Math.round((hp.current / hp.max) * 100))
      this.dom.hp.textContent = `${Math.max(0, Math.round(hp.current))} / ${hp.max}`
      this.dom.hpBar.style.width = `${pct}%`
      this.dom.hpBar.style.background =
        pct > 50 ? '#5cd66a' : pct > 25 ? '#f0c33a' : '#e04d4d'
    }
    if (w) {
      const reloading = w.reloading ? ' (recarregando)' : ''
      this.dom.ammo.textContent = `${w.ammo} / ${w.reserve}${reloading}`
    }

    for (const entity of entities) {
      const gs = entity.getComponent(GameStateComponent)!
      this.dom.wave.textContent = gs.wave === 0 ? '—' : String(gs.wave)
      this.dom.kills.textContent = String(gs.killsTotal)
      this.dom.gamepad.textContent = gs.gamepadConnected ? 'gamepad: ✓' : 'gamepad: teclado'

      if (gs.phase === 'paused') {
        this.show(
          'PAUSADO',
          'Start / Esc continua  •  Backspace / B volta ao menu',
        )
      } else if (gs.phase === 'gameover') {
        this.show(
          'VOCÊ MORREU',
          `kills: ${gs.killsTotal}  •  wave: ${gs.wave}\nA / Enter reinicia  •  Backspace / B volta ao menu`,
        )
      } else if (gs.phase === 'intermission') {
        const t = Math.ceil(gs.intermissionTimer)
        const title = gs.wave === 0 ? 'CIDADE ABANDONADA' : `WAVE ${gs.wave} sobrevivida`
        const sub = pc?.isDead ? '' : `próxima onda em ${t}…`
        this.show(title, sub)
      } else {
        this.hide()
      }
    }
  }

  private show(title: string, sub: string): void {
    this.dom.overlay.style.display = 'flex'
    this.dom.overlayTitle.textContent = title
    // Permite quebra de linha em `sub` via \n. Strings vêm só do código,
    // não há risco de injeção.
    this.dom.overlaySub.innerHTML = sub
      .split('\n')
      .map((line) => escapeHtml(line))
      .join('<br>')
  }
  private hide(): void {
    this.dom.overlay.style.display = 'none'
  }
}
