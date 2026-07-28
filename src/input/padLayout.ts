/**
 * **Layout standard do gamepad** (W3C) — os índices que a Gamepad API do
 * browser e o host nativo (`native/src/shims/input.cpp`, que traduz de SDL)
 * expõem. Constantes nomeadas em vez de números soltos nos bindings default e
 * nos sistemas.
 *
 * Controle genérico fora do banco de mapeamentos pode entregar OUTRA ordem —
 * é justamente o que a tela de Controles (SPEC-0165) conserta.
 */

/** Botão A / cruz (sul). */
export const GP_A = 0;
/** Botão B / círculo (leste). */
export const GP_B = 1;
/** Botão X / quadrado (oeste). */
export const GP_X = 2;
/** Botão Y / triângulo (norte). */
export const GP_Y = 3;
/** Ombro esquerdo. */
export const GP_LB = 4;
/** Ombro direito. */
export const GP_RB = 5;
/** Gatilho esquerdo (analógico via `getButtonValue`). */
export const GP_LT = 6;
/** Gatilho direito (analógico via `getButtonValue`). */
export const GP_RT = 7;
/** Back / View / Select. */
export const GP_BACK = 8;
/** Start / Menu. */
export const GP_START = 9;
/** Clique do stick esquerdo. */
export const GP_L3 = 10;
/** Clique do stick direito. */
export const GP_R3 = 11;
/** D-pad para cima. */
export const GP_DPAD_UP = 12;
/** D-pad para baixo. */
export const GP_DPAD_DOWN = 13;
/** D-pad para a esquerda. */
export const GP_DPAD_LEFT = 14;
/** D-pad para a direita. */
export const GP_DPAD_RIGHT = 15;

/** Eixo X do stick esquerdo (negativo = esquerda). */
export const GP_AXIS_LEFT_X = 0;
/** Eixo Y do stick esquerdo (negativo = para cima/frente). */
export const GP_AXIS_LEFT_Y = 1;
/** Eixo X do stick direito. */
export const GP_AXIS_RIGHT_X = 2;
/** Eixo Y do stick direito. */
export const GP_AXIS_RIGHT_Y = 3;
