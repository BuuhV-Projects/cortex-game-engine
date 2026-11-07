/** Vistas do teclado numérico na prévia do Auto-rig (SPEC-0712): tecla → vista, oposta e mais próxima. */

import { describe, it, expect } from 'vitest'
import { OPPOSITE_VIEW, VIEW_DIRECTIONS, isInverseView, nearestView, viewActionForKey, type RigView } from '../../electron/renderer/rigViewKeys.js'

describe('viewActionForKey', () => {
  it('1/3/7 dão frente, direita e topo; com o inverso, trás, esquerda e baixo', () => {
    expect(viewActionForKey('Numpad1', false)).toEqual({ kind: 'view', view: 'front' })
    expect(viewActionForKey('Numpad1', true)).toEqual({ kind: 'view', view: 'back' })
    expect(viewActionForKey('Numpad3', false)).toEqual({ kind: 'view', view: 'right' })
    expect(viewActionForKey('Numpad3', true)).toEqual({ kind: 'view', view: 'left' })
    expect(viewActionForKey('Numpad7', false)).toEqual({ kind: 'view', view: 'top' })
    expect(viewActionForKey('Numpad7', true)).toEqual({ kind: 'view', view: 'bottom' })
  })

  it('9 inverte e 5 alterna a projeção', () => {
    expect(viewActionForKey('Numpad9', false)).toEqual({ kind: 'opposite' })
    expect(viewActionForKey('Numpad5', true)).toEqual({ kind: 'toggleOrtho' })
  })

  it('o resto não é atalho (inclui os dígitos da linha de cima)', () => {
    for (const code of ['Digit1', 'Numpad2', 'Numpad0', 'KeyW', 'NumpadEnter']) expect(viewActionForKey(code, false)).toBeNull()
  })
})

describe('isInverseView', () => {
  const k = (key: string, numLock: boolean, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) =>
    isInverseView({ ctrlKey: false, shiftKey: false, ...mods, key, numLock })

  it('Ctrl ou Shift invertem; o dígito puro não', () => {
    expect(k('1', true)).toBe(false)
    expect(k('1', true, { ctrlKey: true })).toBe(true)
    expect(k('1', true, { shiftKey: true })).toBe(true)
  })

  it('Shift+Numpad no Windows (NumLock ligado, chega End sem shiftKey) inverte; NumLock desligado não', () => {
    expect(k('End', true)).toBe(true)
    expect(k('End', false)).toBe(false)
  })
})

describe('direções das vistas', () => {
  it('são eixos globais: frente +Z, direita +X, topo +Y (um fio fora do polo)', () => {
    expect(VIEW_DIRECTIONS.front).toEqual([0, 0, 1])
    expect(VIEW_DIRECTIONS.right).toEqual([1, 0, 0])
    expect(VIEW_DIRECTIONS.top[1]).toBe(1)
    expect(VIEW_DIRECTIONS.top[2]).toBeGreaterThan(0)
    expect(VIEW_DIRECTIONS.top[2]).toBeLessThan(1e-3)
  })

  it('a oposta de cada vista aponta para o lado contrário', () => {
    for (const view of Object.keys(OPPOSITE_VIEW) as RigView[]) {
      const a = VIEW_DIRECTIONS[view]
      const b = VIEW_DIRECTIONS[OPPOSITE_VIEW[view]]
      expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeLessThan(-0.99)
      expect(OPPOSITE_VIEW[OPPOSITE_VIEW[view]]).toBe(view)
    }
  })
})

describe('nearestView (Numpad 5 endireita)', () => {
  it('escolhe o eixo dominante da direção atual', () => {
    expect(nearestView([0.6, 0.15, 1.9])).toBe('front')
    expect(nearestView([-3, 0.5, 1])).toBe('left')
    expect(nearestView([0.2, -5, 0.1])).toBe('bottom')
    expect(nearestView([0.1, 2, -0.3])).toBe('top')
  })

  it('cada vista alinhada volta para si mesma', () => {
    for (const view of Object.keys(VIEW_DIRECTIONS) as RigView[]) expect(nearestView(VIEW_DIRECTIONS[view])).toBe(view)
  })
})
