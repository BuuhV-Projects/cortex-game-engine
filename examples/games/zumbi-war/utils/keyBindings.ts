/**
 * Mapeamento configurável de ações → tecla(s) do teclado.
 *
 * Persiste em localStorage sob `cidade-abandonada:keybindings`.
 * Cada ação aceita 1+ teclas (`KeyboardEvent.key`). Comparação é
 * case-insensitive (lowercased).
 */

export type ActionId =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'reload'
  | 'pause'

export type KeyBindings = Record<ActionId, string[]>

export const ACTION_LABELS: Record<ActionId, string> = {
  moveForward: 'Andar pra frente',
  moveBack: 'Andar pra trás',
  moveLeft: 'Andar pra esquerda',
  moveRight: 'Andar pra direita',
  sprint: 'Correr',
  reload: 'Recarregar',
  pause: 'Pausar',
}

export const DEFAULT_BINDINGS: KeyBindings = {
  moveForward: ['w', 'arrowup'],
  moveBack: ['s', 'arrowdown'],
  moveLeft: ['a', 'arrowleft'],
  moveRight: ['d', 'arrowright'],
  sprint: ['shift'],
  reload: ['r'],
  pause: ['escape'],
}

const STORAGE_KEY = 'cidade-abandonada:keybindings'

export function loadBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneDefaults()
    const parsed = JSON.parse(raw) as Partial<KeyBindings>
    const merged = cloneDefaults()
    for (const key of Object.keys(merged) as ActionId[]) {
      const v = parsed[key]
      if (Array.isArray(v) && v.length > 0 && v.every((k) => typeof k === 'string')) {
        merged[key] = v.map((k) => k.toLowerCase())
      }
    }
    return merged
  } catch {
    return cloneDefaults()
  }
}

export function saveBindings(b: KeyBindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b))
  } catch {
    /* localStorage indisponível — segue com defaults */
  }
}

function cloneDefaults(): KeyBindings {
  return {
    moveForward: [...DEFAULT_BINDINGS.moveForward],
    moveBack: [...DEFAULT_BINDINGS.moveBack],
    moveLeft: [...DEFAULT_BINDINGS.moveLeft],
    moveRight: [...DEFAULT_BINDINGS.moveRight],
    sprint: [...DEFAULT_BINDINGS.sprint],
    reload: [...DEFAULT_BINDINGS.reload],
    pause: [...DEFAULT_BINDINGS.pause],
  }
}

/**
 * Normaliza um KeyboardEvent.key para a forma usada nos bindings.
 * Lowercase; "Shift" / "Control" / "Alt" também viram lowercase.
 */
export function normalizeKey(k: string): string {
  return k.toLowerCase()
}

/**
 * Nome amigável pra exibir no HUD/menu — ex.: 'arrowup' → '↑', 'w' → 'W'.
 */
export function displayKey(k: string): string {
  switch (k) {
    case ' ':
    case 'space':
      return 'Space'
    case 'arrowup':
      return '↑'
    case 'arrowdown':
      return '↓'
    case 'arrowleft':
      return '←'
    case 'arrowright':
      return '→'
    case 'escape':
      return 'Esc'
    case 'shift':
      return 'Shift'
    case 'control':
      return 'Ctrl'
    case 'alt':
      return 'Alt'
    case 'enter':
      return 'Enter'
    default:
      return k.length === 1 ? k.toUpperCase() : k
  }
}
