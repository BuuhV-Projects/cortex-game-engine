import { describe, expect, it } from 'vitest'
import {
  MIN_SCORE, REQUIRED_CHECKS, REVIEW_BOT, SKIPPABLE_CHECKS, approvedAt, checksPassed, evaluate, failingChecks,
  reviewScore,
} from '../../.github/scripts/auto-merge.mjs'

const ready = {
  state: 'OPEN', isDraft: false, baseRefName: 'main', isCrossRepository: false,
  failing: [] as string[], score: 5,
  openThreads: 0, moreThreads: false,
}
const ok = { status: 'completed', conclusion: 'success' }
const skipped = { status: 'completed', conclusion: 'skipped' }

describe('auto-merge (SPEC-0739)', () => {
  it('mergeia com checks verdes, 5/5 e conversas resolvidas', () => {
    expect(evaluate(ready).ok).toBe(true)
  })

  it.each([
    ['check vermelho', { failing: ['Tests (Vitest)'] }],
    ['sem Claude review no head', { score: null }],
    ['Claude review abaixo do mínimo', { score: MIN_SCORE - 1 }],
    ['conversa aberta', { openThreads: 1 }],
    ['conversas além de uma página', { moreThreads: true }],
    ['rascunho', { isDraft: true }],
    ['de fork', { isCrossRepository: true }],
    ['fechado', { state: 'MERGED' }],
    ['outra base (pilha)', { baseRefName: 'perf/x' }],
  ])('bloqueia: %s', (_, patch) => {
    expect(evaluate({ ...ready, ...patch }).ok).toBe(false)
  })

  it('check só passa com execução concluída e todas em success', () => {
    expect(checksPassed([])).toBe(false)
    expect(checksPassed([ok])).toBe(true)
    expect(checksPassed([{ status: 'in_progress', conclusion: null }])).toBe(false)
    expect(checksPassed([ok, { status: 'completed', conclusion: 'failure' }])).toBe(false)
    expect(checksPassed([skipped])).toBe(false)
    expect(checksPassed([skipped], true)).toBe(true)
  })
})

describe('checks obrigatórios do ruleset (SPEC-0739)', () => {
  const all = [...REQUIRED_CHECKS, ...SKIPPABLE_CHECKS]

  it('os quatro do ruleset "Protecao do main"', () => {
    expect(all.sort()).toEqual([
      'Detectar mudanças', 'Host nativo (Windows) + cortex_host_tests', 'Regras do repo', 'Tests (Vitest)',
    ])
  })

  it('host nativo pulado (PR sem nativo) não barra; testes pulados barram', () => {
    const runs = (status: Record<string, { status: string; conclusion: string | null }>) => (name: string) =>
      status[name] ? [status[name]!] : [ok]
    expect(failingChecks(runs({ 'Host nativo (Windows) + cortex_host_tests': skipped }))).toEqual([])
    expect(failingChecks(runs({ 'Tests (Vitest)': skipped }))).toEqual(['Tests (Vitest)'])
  })

  it('check que nem rodou no head barra', () => {
    expect(failingChecks((name) => (name === 'Regras do repo' ? [] : [ok]))).toEqual(['Regras do repo'])
  })
})

describe('Claude review no gate (SPEC-0739)', () => {
  const body = (n: number) => `**Claude review: ${n}/5**\n\nresumo`
  const bot = { login: REVIEW_BOT }

  it('só 5/5 passa; nota 4 bloqueia', () => {
    expect(MIN_SCORE).toBe(5)
    expect(evaluate({ ...ready, score: 4 }).ok).toBe(false)
  })

  it('lê a nota mais recente do bot no head e ignora o resto', () => {
    expect(reviewScore([], 'h')).toBeNull()
    expect(reviewScore([
      { user: bot, commit_id: 'h', body: body(3) },
      { user: { login: 'alguem' }, commit_id: 'h', body: body(5) },
      { user: bot, commit_id: 'velho', body: body(5) },
      { user: bot, commit_id: 'h', body: body(4) },
      { user: bot, commit_id: 'h', body: 'comentário sem nota' },
      { user: null, commit_id: 'h', body: body(5) },
    ], 'h')).toBe(4)
  })

  it('aprovação só conta no head', () => {
    expect(approvedAt([{ commit_id: 'velho', state: 'APPROVED' }], 'h')).toBe(false)
    expect(approvedAt([{ commit_id: 'h', state: 'COMMENTED' }, { commit_id: 'h', state: 'APPROVED' }], 'h')).toBe(true)
  })
})
