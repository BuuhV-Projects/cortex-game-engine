/**
 * Helpers de tratamento de stick analógico — deadzone radial,
 * rescaling e curva de resposta.
 *
 * O GamepadManager do engine já aplica uma deadzone por eixo (corta
 * `|v| < dz` pra 0). Esses helpers fazem três coisas adicionais:
 *
 *   1. **Deadzone radial** — checa a magnitude do vetor 2D (x,y) em
 *      vez de cada eixo isolado. Evita que diagonais lentas "perdam"
 *      um eixo abaixo do limiar.
 *   2. **Rescaling** — depois de cortar a deadzone, re-mapeia `[dz..1]`
 *      pra `[0..1]`, preservando a faixa útil do stick.
 *   3. **Curva quadrática** — devolve `sign(v) * v²`. Resposta lenta
 *      perto da origem (mais controle fino) e rápida no fim.
 *
 * Importante pra um caso real: controles com drift forte (>0.2)
 * deslizam continuamente, porque o input integrado (pitch / yaw)
 * acumula até saturar. Deadzone radial agressiva (~0.25) cobre isso.
 */

export function applyRadialDeadzone(
  x: number,
  y: number,
  dz: number,
): [number, number] {
  const mag = Math.hypot(x, y)
  if (mag < dz) return [0, 0]
  const scale = (mag - dz) / (1 - dz) / mag
  return [x * scale, y * scale]
}

export function curve(v: number): number {
  return Math.sign(v) * v * v
}

/** Atalho: 1 eixo, com deadzone+rescale+curva. */
export function processAxis(v: number, dz: number): number {
  const abs = Math.abs(v)
  if (abs < dz) return 0
  const rescaled = Math.sign(v) * ((abs - dz) / (1 - dz))
  return curve(rescaled)
}
