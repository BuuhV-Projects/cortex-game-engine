/**
 * Saúde do turno do Chat IA (ADR-0272): a partir do início do turno e da última
 * atividade (texto, card aberto, card fechado), diz se ele está trabalhando,
 * quieto ou possivelmente travado. Pura, para ser testada sem a UI.
 */

/** Sem atividade por este tempo, a barra passa a dizer há quanto está quieto. */
export const QUIET_AFTER_MS = 60_000
/** Sem atividade por este tempo, a barra avisa que pode ter travado. */
export const STALLED_AFTER_MS = 5 * 60_000

export type TurnHealthLevel = 'working' | 'quiet' | 'stalled'

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

/** `45s`, `3m12s`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  const minutes = Math.floor(total / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

/** Nível da saúde pelo tempo desde a última atividade. */
export function turnHealthLevel(idleMs: number): TurnHealthLevel {
  if (idleMs >= STALLED_AFTER_MS) return 'stalled'
  return idleMs >= QUIET_AFTER_MS ? 'quiet' : 'working'
}
