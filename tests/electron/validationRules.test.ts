/**
 * Testes das regras de validação aprendidas do projeto
 * (electron/agent/validationRules.ts, ADR-0115): parse defensivo, merge com
 * trilha de auditoria, descrição do patch e roundtrip em disco.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  parseValidationRules,
  loadValidationRules,
  saveValidationRules,
  mergeValidationRules,
  describeRulePatch,
} from '../../electron/agent/validationRules.js'

describe('parseValidationRules (defensivo)', () => {
  it('entrada não-objeto vira null', () => {
    expect(parseValidationRules(null)).toBeNull()
    expect(parseValidationRules('x')).toBeNull()
  })

  it('mantém só thresholds numéricos válidos e severities conhecidas', () => {
    const r = parseValidationRules({
      thresholds: { maxGap: 2.5, maxRise: 'alto', maxPenetration: -1, bogus: 9 },
      severity: { gap: 'error', floating: 'off', foo: 'gritante' },
    })!
    expect(r.thresholds).toEqual({ maxGap: 2.5 })
    expect(r.severity).toEqual({ gap: 'error', floating: 'off' })
  })

  it('arquivo sem nada útil parseia como regras vazias (não quebra o validate)', () => {
    const r = parseValidationRules({ thresholds: { maxGap: 'x' } })!
    expect(r.thresholds).toBeUndefined()
    expect(r.severity).toBeUndefined()
  })
})

describe('mergeValidationRules + describeRulePatch', () => {
  const lesson = { date: '2026-07-16', patch: 'p', motivo: 'm', checked: true }

  it('patch sobre base nula cria o arquivo com a lição', () => {
    const m = mergeValidationRules(null, { thresholds: { maxGap: 2.5 } }, lesson)
    expect(m.thresholds).toEqual({ maxGap: 2.5 })
    expect(m.severity).toBeUndefined()
    expect(m.lessons).toHaveLength(1)
  })

  it('patch sobrescreve por chave e ACUMULA lições', () => {
    const base = mergeValidationRules(null, { thresholds: { maxGap: 2.5 }, severity: { gap: 'error' } }, lesson)
    const m = mergeValidationRules(base, { thresholds: { maxRise: 2 } }, { ...lesson, motivo: 'm2' })
    expect(m.thresholds).toEqual({ maxGap: 2.5, maxRise: 2 })
    expect(m.severity).toEqual({ gap: 'error' })
    expect(m.lessons!.map((l) => l.motivo)).toEqual(['m', 'm2'])
  })

  it('describeRulePatch mostra valor anterior → novo', () => {
    const base = mergeValidationRules(null, { thresholds: { maxGap: 2.8 } }, lesson)
    expect(describeRulePatch(base, { thresholds: { maxGap: 2.5 }, severity: { gap: 'error' } })).toBe(
      'maxGap 2.8 → 2.5; gap: default → error',
    )
  })
})

describe('load/save em disco', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cortex-rules-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('projeto sem arquivo → null; roundtrip preserva regras e lições', async () => {
    expect(await loadValidationRules(root)).toBeNull()
    const rules = mergeValidationRules(
      null,
      { thresholds: { maxGap: 1.5 }, severity: { gap: 'error' } },
      { date: '2026-07-16', patch: 'maxGap default → 1.5', motivo: 'pulo curto neste jogo', checked: true },
    )
    await saveValidationRules(root, rules)
    const loaded = await loadValidationRules(root)
    expect(loaded).toEqual(rules)
  })
})
