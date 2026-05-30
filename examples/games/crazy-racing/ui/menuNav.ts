import { getGamepadManager, XBOX_AXIS, XBOX_BUTTON } from '../utils/gamepad'
import { playCancel, playConfirm, playNav } from '../utils/uiSound'

/**
 * Helper de navegação por joystick/teclado para overlays DOM.
 *
 * Navegação espacial 2D: ↑↓←→ procuram o elemento focável mais próximo
 * NA DIREÇÃO indicada (usando bounding rect), não a próxima posição na
 * lista do DOM. Isso faz sentido em grids onde cards ficam lado-a-lado.
 *
 * A clica no foco, B chama `onBack`. Setas do teclado e Enter/Esc também
 * funcionam.
 */
export interface MenuNavOptions {
  items: () => HTMLElement[]
  onBack?: () => void
  repeatMs?: number
  initialDelayMs?: number
}

export interface MenuNav {
  start(): void
  stop(): void
  focusFirst(): void
}

type Dir = 'up' | 'down' | 'left' | 'right'

export function createMenuNav(opts: MenuNavOptions): MenuNav {
  const repeatMs = opts.repeatMs ?? 180
  const initialDelay = opts.initialDelayMs ?? 380
  let alive = false
  let rafId = 0
  let focusedIndex = -1

  let dir: Dir | null = null
  let dirStartMs = 0
  let lastEmitMs = 0

  let lastA = false
  let lastB = false

  const styleId = 'menuNav-style'
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style')
    s.id = styleId
    s.textContent = `
      .menuNav-focused {
        outline: 3px solid #ffd23f !important;
        outline-offset: 2px;
        box-shadow: 0 0 0 4px rgba(255,210,63,0.25);
      }
    `
    document.head.appendChild(s)
  }

  const items = () => opts.items().filter((el) =>
    !el.hasAttribute('disabled') && el.offsetParent !== null)

  function applyFocus(i: number): void {
    const list = items()
    if (list.length === 0) { focusedIndex = -1; return }
    focusedIndex = ((i % list.length) + list.length) % list.length
    list.forEach((el, idx) => el.classList.toggle('menuNav-focused', idx === focusedIndex))
    const target = list[focusedIndex]
    if (target && typeof (target as HTMLElement).scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  /**
   * Navegação espacial: acha o item mais próximo no semiplano indicado por
   * `d`. Pontua por (distância no eixo principal) + 2·(distância no eixo
   * perpendicular). Tolerância de 6px pra ignorar quase-coplanares.
   */
  function moveDir(d: Dir): void {
    const list = items()
    if (list.length === 0) return
    if (focusedIndex < 0) { applyFocus(0); return }

    const cur = list[focusedIndex].getBoundingClientRect()
    const cx = cur.left + cur.width / 2
    const cy = cur.top + cur.height / 2

    let bestIdx = -1
    let bestScore = Infinity
    for (let i = 0; i < list.length; i++) {
      if (i === focusedIndex) continue
      const r = list[i].getBoundingClientRect()
      const rx = r.left + r.width / 2
      const ry = r.top + r.height / 2
      const dx = rx - cx
      const dy = ry - cy

      let mainDelta: number, crossDelta: number
      switch (d) {
        case 'down':  mainDelta =  dy; crossDelta = Math.abs(dx); break
        case 'up':    mainDelta = -dy; crossDelta = Math.abs(dx); break
        case 'right': mainDelta =  dx; crossDelta = Math.abs(dy); break
        case 'left':  mainDelta = -dx; crossDelta = Math.abs(dy); break
      }
      if (mainDelta < 6) continue   // candidato precisa estar do lado certo
      const score = mainDelta + crossDelta * 2
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx >= 0 && bestIdx !== focusedIndex) {
      applyFocus(bestIdx)
      playNav()
    }
    // sem candidato (chega-no-fim) → mantém foco e fica silencioso
  }

  function activate(): void {
    const list = items()
    if (focusedIndex < 0) { applyFocus(0); return }
    const el = list[focusedIndex]
    if (el) {
      playConfirm()
      el.click()
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (!alive) return
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveDir('up') }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); moveDir('down') }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); moveDir('left') }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveDir('right') }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
    else if (e.key === 'Escape' || e.key === 'Backspace') {
      if (opts.onBack) { e.preventDefault(); playCancel(); opts.onBack() }
    }
  }

  function pollGamepad(): void {
    if (!alive) return
    const gp = getGamepadManager()
    gp.poll()

    let chosenSlot = -1
    for (let s = 0; s < 4; s++) {
      if (gp.getGamepad(s)) { chosenSlot = s; break }
    }

    if (chosenSlot >= 0) {
      const lx = gp.getAxis(chosenSlot, XBOX_AXIS.LX)
      const ly = gp.getAxis(chosenSlot, XBOX_AXIS.LY)
      const up    = gp.isButtonDown(chosenSlot, XBOX_BUTTON.DPAD_UP)    || ly < -0.5
      const down  = gp.isButtonDown(chosenSlot, XBOX_BUTTON.DPAD_DOWN)  || ly >  0.5
      const left  = gp.isButtonDown(chosenSlot, XBOX_BUTTON.DPAD_LEFT)  || lx < -0.5
      const right = gp.isButtonDown(chosenSlot, XBOX_BUTTON.DPAD_RIGHT) || lx >  0.5

      const newDir: Dir | null =
        up ? 'up' : down ? 'down' : left ? 'left' : right ? 'right' : null

      const now = performance.now()
      if (newDir !== dir) {
        dir = newDir
        dirStartMs = now
        lastEmitMs = 0
        if (dir) emitDir()
      } else if (dir) {
        const elapsed = now - dirStartMs
        if (elapsed > initialDelay && now - lastEmitMs > repeatMs) emitDir()
      }

      const a = gp.isButtonDown(chosenSlot, XBOX_BUTTON.A)
      if (a && !lastA) activate()
      lastA = a

      const b = gp.isButtonDown(chosenSlot, XBOX_BUTTON.B)
      if (b && !lastB && opts.onBack) { playCancel(); opts.onBack() }
      lastB = b
    } else {
      dir = null
      lastA = false
      lastB = false
    }

    rafId = requestAnimationFrame(pollGamepad)

    function emitDir() {
      lastEmitMs = performance.now()
      if (dir) moveDir(dir)
    }
  }

  return {
    start() {
      if (alive) return
      alive = true
      document.addEventListener('keydown', onKey)
      applyFocus(0)
      rafId = requestAnimationFrame(pollGamepad)
    },
    stop() {
      alive = false
      document.removeEventListener('keydown', onKey)
      cancelAnimationFrame(rafId)
      items().forEach((el) => el.classList.remove('menuNav-focused'))
      focusedIndex = -1
    },
    focusFirst() { applyFocus(0) },
  }
}
