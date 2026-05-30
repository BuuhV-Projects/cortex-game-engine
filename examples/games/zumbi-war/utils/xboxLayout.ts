/**
 * Mapeamento de botões/eixos do controle Xbox usado pelo GamepadManager
 * do engine (que segue o layout "standard" da Gamepad API).
 */

export const XBOX = {
  // Botões
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  LS_CLICK: 10,
  RS_CLICK: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  // Eixos
  LS_X: 0,
  LS_Y: 1,
  RS_X: 2,
  RS_Y: 3,
} as const
