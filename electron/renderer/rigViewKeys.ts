/**
 * Vistas do teclado numérico na prévia do Auto-rig, como no Blender (SPEC-0712).
 * Parte pura: tecla → vista, vista oposta e a vista alinhada mais próxima.
 * Direções são do ALVO para a CÂMERA, em eixos globais do mundo.
 */

export type RigView = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom'

export type Vec3 = readonly [number, number, number]

/** O que uma tecla do numpad pede à câmera. */
export type RigViewAction = { kind: 'view'; view: RigView } | { kind: 'opposite' } | { kind: 'toggleOrtho' }

/** Desvio do polo no topo/baixo: o OrbitControls não aceita a câmera exatamente no eixo Y. */
const POLE_NUDGE = 1e-4

export const VIEW_DIRECTIONS: Readonly<Record<RigView, Vec3>> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 1, POLE_NUDGE],
  bottom: [0, -1, POLE_NUDGE],
}

export const OPPOSITE_VIEW: Readonly<Record<RigView, RigView>> = {
  front: 'back',
  back: 'front',
  right: 'left',
  left: 'right',
  top: 'bottom',
  bottom: 'top',
}

/** Numpad 1/3/7: a vista e o seu inverso (Ctrl no Blender; Shift também vale). */
const NUMPAD_VIEWS: Readonly<Record<string, readonly [RigView, RigView]>> = {
  Numpad1: ['front', 'back'],
  Numpad3: ['right', 'left'],
  Numpad7: ['top', 'bottom'],
}

/** A ação de uma tecla (pelo `KeyboardEvent.code`, independe do NumLock), ou `null` se não é atalho de vista. */
export function viewActionForKey(code: string, inverse: boolean): RigViewAction | null {
  const pair = NUMPAD_VIEWS[code]
  if (pair) return { kind: 'view', view: pair[inverse ? 1 : 0] }
  if (code === 'Numpad9') return { kind: 'opposite' }
  if (code === 'Numpad5') return { kind: 'toggleOrtho' }
  return null
}

/**
 * O inverso (Ctrl no Blender; Shift também vale). No Windows, Shift+Numpad com o NumLock ligado chega
 * SEM `shiftKey` e com a tecla de navegação (`End`, `PageDown`…) no lugar do dígito: isso conta como Shift.
 */
export function isInverseView(e: { ctrlKey: boolean; shiftKey: boolean; key: string; numLock: boolean }): boolean {
  return e.ctrlKey || e.shiftKey || (e.numLock && !/^\d$/.test(e.key))
}

/** A vista alinhada cuja direção mais se parece com `dir` (alvo → câmera; não precisa ser unitária). */
export function nearestView(dir: Vec3): RigView {
  let best: RigView = 'front'
  let bestDot = -Infinity
  for (const view of Object.keys(VIEW_DIRECTIONS) as RigView[]) {
    const v = VIEW_DIRECTIONS[view]
    const dot = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]
    if (dot > bestDot) {
      bestDot = dot
      best = view
    }
  }
  return best
}
