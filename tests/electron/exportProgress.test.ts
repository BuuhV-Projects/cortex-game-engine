/**
 * Conta da barra de progresso do export (SPEC-0699).
 */
import { describe, it, expect } from 'vitest'
import { STEP_WEIGHT, assetsFraction, overallPercent, parseDetail } from '../../electron/renderer/exportProgress.js'

describe('exportProgress', () => {
  it('pesos somam 100', () => {
    expect(Object.values(STEP_WEIGHT).reduce((a: number, b: number) => a + b, 0)).toBe(100)
  })

  it('percentual = etapas concluídas + fração da atual', () => {
    expect(overallPercent('prepare')).toBe(0)
    expect(overallPercent('bytecode')).toBe(16)
    expect(overallPercent('assets', 0.5)).toBe(22 + 39)
    expect(overallPercent('assets', 1)).toBe(100)
  })

  it('fração do cook conta as texturas já feitas do GLB em curso', () => {
    expect(assetsFraction({ phase: 'cook', done: 1, total: 4 })).toBe(0.25)
    // GLB 2 de 4, textura 3 de 4 em curso → 1 + 2/4 arquivos
    expect(assetsFraction({ phase: 'cook', done: 1, total: 4, tex: [3, 4] })).toBe(1.5 / 4)
    expect(assetsFraction({ phase: 'cook', done: 0, total: 0 })).toBe(0)
    expect(assetsFraction({ phase: 'pack' })).toBe(1)
  })

  it('parse do payload do IPC', () => {
    expect(parseDetail('progress:{"phase":"cook","done":2,"total":9,"file":"a b.glb"}')).toEqual({
      phase: 'cook',
      done: 2,
      total: 9,
      file: 'a b.glb',
    })
    expect(parseDetail('assets')).toBeNull()
    expect(parseDetail('progress:{quebrado')).toBeNull()
    expect(parseDetail('progress:{"phase":"outra"}')).toBeNull()
  })
})
