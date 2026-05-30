/**
 * Save/load do progresso. Snapshot mínimo: número da onda concluída,
 * kills totais, HP, munição.
 *
 * Não serializa posição do player nem zumbis ativos — restaura no
 * início da próxima wave.
 */

const STORAGE_KEY = 'cidade-abandonada:save'
const SAVE_VERSION = 1

export interface SaveSnapshot {
  version: number
  /** Última wave concluída (próxima a iniciar = wave + 1). */
  completedWave: number
  killsTotal: number
  /** Vida ao iniciar a próxima wave. Mínimo 30 pra evitar restart frustrante. */
  hp: number
  /** Munição no pente. */
  ammo: number
  /** Munição na reserva. */
  reserve: number
  savedAtIso: string
}

export function loadSave(): SaveSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SaveSnapshot
    if (parsed.version !== SAVE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function writeSave(snap: Omit<SaveSnapshot, 'version' | 'savedAtIso'>): void {
  try {
    const full: SaveSnapshot = {
      version: SAVE_VERSION,
      savedAtIso: new Date().toISOString(),
      ...snap,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full))
  } catch {
    /* localStorage indisponível */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  return loadSave() !== null
}
