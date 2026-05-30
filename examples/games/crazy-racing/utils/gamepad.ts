/**
 * Wrapper fino sobre o GamepadManager nativo do cortex-game-engine.
 *
 * Mantém uma instância singleton (deadzone 0.15) — chamadores devem
 * invocar `poll()` 1x por frame quando lendo estado contínuo. As helpers
 * de checagem rápida (`isAnyPadConnected`) fazem `poll()` por si só.
 *
 * Constantes XBOX_BUTTON / XBOX_AXIS mapeiam o layout Xbox padrão.
 */
import { GamepadManager } from 'cortex-game-engine'

let manager: GamepadManager | null = null

export function getGamepadManager(): GamepadManager {
  if (!manager) manager = new GamepadManager({ deadzone: 0.15 })
  return manager
}

export const XBOX_BUTTON = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LS: 10, RS: 11,
  DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
} as const

export const XBOX_AXIS = { LX: 0, LY: 1, RX: 2, RY: 3 } as const

export function isAnyPadConnected(): boolean {
  const gp = getGamepadManager()
  gp.poll()
  for (let i = 0; i < 4; i++) if (gp.getGamepad(i)) return true
  return false
}

export function isPadConnected(slot: number): boolean {
  const gp = getGamepadManager()
  gp.poll()
  return gp.getGamepad(slot) !== null
}
