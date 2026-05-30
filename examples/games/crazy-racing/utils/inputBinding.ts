import { XBOX_BUTTON } from './gamepad'

/**
 * Mapeamento de botões do gamepad para ações do jogo. Aplicado a todos
 * os jogadores (slot 0 e slot 1) — v1 não diferencia por jogador.
 */
export interface GamepadBinding {
  throttleButton: number
  brakeButton: number
  pauseButton: number
  invertSteer: boolean
}

export const DEFAULT_BINDING: GamepadBinding = {
  throttleButton: XBOX_BUTTON.RT,
  brakeButton:    XBOX_BUTTON.LT,
  pauseButton:    XBOX_BUTTON.START,
  invertSteer:    false,
}

/** Nome amigável de cada índice de botão Xbox padrão. */
export const XBOX_BUTTON_NAMES: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'Back',
  9: 'Start',
  10: 'L3 (stick)',
  11: 'R3 (stick)',
  12: 'D-Pad ↑',
  13: 'D-Pad ↓',
  14: 'D-Pad ←',
  15: 'D-Pad →',
}

export function buttonName(index: number): string {
  return XBOX_BUTTON_NAMES[index] ?? `Botão ${index}`
}
