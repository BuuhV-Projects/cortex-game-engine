/**
 * Lista de projetos recentes da tela inicial (SPEC-0178) — persistida em
 * `localStorage['recentProjects']`.
 *
 * Módulo puro (sem DOM): o storage entra por parâmetro, então dá pra testar em
 * ambiente node com um storage falso. Quem desenha a lista é o `Launcher`.
 */
export interface Recent {
  path: string
  name: string
  openedAt: number
}

/** Chave no localStorage — mesma de sempre (não migrar: quebraria os recentes existentes). */
export const RECENTS_KEY = 'recentProjects'

/** Quantos projetos a lista guarda; os mais antigos caem fora. */
export const MAX_RECENTS = 10

/** Só o que este módulo usa do `Storage` — facilita o falso no teste. */
export type RecentsStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): RecentsStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

/** Último segmento do path (tolera barra final e separador `/` ou `\`). */
export function projectNameOf(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

/** Lista salva, do mais recente pro mais antigo. Storage ausente/corrompido ⇒ lista vazia. */
export function getRecents(storage: RecentsStorage | null = defaultStorage()): Recent[] {
  if (!storage) return []
  try {
    const v = JSON.parse(storage.getItem(RECENTS_KEY) ?? '[]') as Recent[]
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Põe o projeto no topo (sem duplicar) e satura a lista em `MAX_RECENTS`. */
export function addRecent(
  path: string,
  openedAt: number,
  storage: RecentsStorage | null = defaultStorage(),
): Recent[] {
  const list = getRecents(storage).filter((r) => r.path !== path)
  list.unshift({ path, name: projectNameOf(path), openedAt })
  const next = list.slice(0, MAX_RECENTS)
  storage?.setItem(RECENTS_KEY, JSON.stringify(next))
  return next
}

/** Tira o projeto da lista. Some só do Studio — o projeto continua no disco. */
export function removeRecent(path: string, storage: RecentsStorage | null = defaultStorage()): Recent[] {
  const next = getRecents(storage).filter((r) => r.path !== path)
  storage?.setItem(RECENTS_KEY, JSON.stringify(next))
  return next
}
