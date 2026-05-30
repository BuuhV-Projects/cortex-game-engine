import { GamepadManager } from 'cortex-game-engine'
import { XBOX } from './xboxLayout'

/**
 * Loop de polling + foco/ativação que faz um menu DOM navegável por
 * gamepad (D-Pad, LS) e teclado (↑↓, Enter, Esc, B).
 *
 * Cada "tela" do menu chama `setItems(focusables, onBack?)` quando
 * monta seu DOM, passando a lista de elementos focáveis em ordem
 * linear. `start()`/`stop()` controlam o RAF do polling — a tela que
 * abrir o menu chama `start()` uma vez e `stop()` antes de resolver.
 */
export class MenuNav {
  private items: HTMLElement[] = []
  private focusIdx = 0
  private onBack: (() => void) | null = null
  private rafId = 0
  private running = false
  private gamepad = new GamepadManager()

  private prevA = false
  private prevB = false
  private prevUp = false
  private prevDown = false
  private prevAxisAccum = 0

  private keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      this.move(1)
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault()
      this.move(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.activate()
    } else if (e.key === 'Escape') {
      if (this.onBack) {
        e.preventDefault()
        this.onBack()
      }
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    document.addEventListener('keydown', this.keyHandler)
    this.poll()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    document.removeEventListener('keydown', this.keyHandler)
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  setItems(items: HTMLElement[], onBack?: () => void): void {
    this.items = items
    this.onBack = onBack ?? null
    this.focusIdx = 0
    this.applyFocus()
  }

  /** Suspende temporariamente o polling (ex.: durante captura de tecla). */
  setPaused(paused: boolean): void {
    if (paused && this.running) {
      this.running = false
      if (this.rafId) cancelAnimationFrame(this.rafId)
      this.rafId = 0
      document.removeEventListener('keydown', this.keyHandler)
    } else if (!paused && !this.running) {
      this.start()
    }
  }

  private move(delta: number): void {
    if (this.items.length === 0) return
    let next = this.focusIdx + delta
    const n = this.items.length
    for (let i = 0; i < n; i++) {
      next = ((next % n) + n) % n
      const el = this.items[next]!
      if (!isDisabled(el)) {
        this.focusIdx = next
        this.applyFocus()
        return
      }
      next += delta
    }
  }

  private activate(): void {
    const el = this.items[this.focusIdx]
    if (!el || isDisabled(el)) return
    el.click()
  }

  private applyFocus(): void {
    for (let i = 0; i < this.items.length; i++) {
      const el = this.items[i]!
      el.classList.toggle('nav-focus', i === this.focusIdx)
      if (i === this.focusIdx) {
        try {
          el.focus({ preventScroll: false })
        } catch {
          el.focus()
        }
      }
    }
  }

  private poll = (): void => {
    if (!this.running) return
    this.gamepad.poll()
    const gp = this.gamepad.getGamepad(0)
    if (gp?.connected) {
      const aDown = this.gamepad.isButtonDown(0, XBOX.A)
      if (aDown && !this.prevA) this.activate()
      this.prevA = aDown

      const bDown = this.gamepad.isButtonDown(0, XBOX.B)
      if (bDown && !this.prevB && this.onBack) this.onBack()
      this.prevB = bDown

      const upDown = this.gamepad.isButtonDown(0, XBOX.DPAD_UP)
      if (upDown && !this.prevUp) this.move(-1)
      this.prevUp = upDown

      const downDown = this.gamepad.isButtonDown(0, XBOX.DPAD_DOWN)
      if (downDown && !this.prevDown) this.move(1)
      this.prevDown = downDown

      // LS_Y como repeat com cooldown — aciona a cada 220ms enquanto
      // o stick estiver fora da deadzone.
      const ay = this.gamepad.getAxis(0, XBOX.LS_Y)
      this.prevAxisAccum += 16
      if (Math.abs(ay) > 0.4) {
        if (this.prevAxisAccum >= 220) {
          this.move(ay > 0 ? 1 : -1)
          this.prevAxisAccum = 0
        }
      } else {
        this.prevAxisAccum = 220
      }
    }
    this.rafId = requestAnimationFrame(this.poll)
  }
}

function isDisabled(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement && el.disabled) return true
  return el.getAttribute('aria-disabled') === 'true'
}
