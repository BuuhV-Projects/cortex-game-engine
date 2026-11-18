import { describe, expect, it } from 'vitest'
import {
  APPROVE_BODY, AUTO_MERGE_WORKFLOW, MERGE_BASE, type PrState, type QueueIo, approveArgs, deleteBranchArgs, dependentsOf,
  dispatchArgs, evaluate, isMissingRef, mergeArgs, retargetArgs, runQueue,
} from '../../.github/scripts/auto-merge.mjs'

const REPO = 'BuuhV-Projects/cortex-game-engine'

/** PR pronto para mergear (checks verdes, 5/5, sem conversa aberta). */
function pr(head: string, base: string, patch: Partial<PrState> = {}): PrState {
  return {
    state: 'OPEN', isDraft: false, baseRefName: base, headRefName: head, isCrossRepository: false,
    failing: [], score: 5, changesRequested: false, behindBy: 0, openThreads: 0, moreThreads: false, ...patch,
  }
}

/**
 * Dublê do GitHub: guarda os PRs, aplica merge/redirecionamento e registra cada passo em `calls`.
 * Sem o redirecionamento, o PR dependente fica com a base antiga e não passa no `evaluate`.
 */
function fakeGitHub(
  prs: Record<string, PrState>,
  fail: Partial<Record<keyof QueueIo, string>> = {},
  approvedHeads: Set<string> = new Set(),
) {
  const calls: string[] = []
  const step = (name: keyof QueueIo, entry: string) => {
    calls.push(entry)
    if (fail[name] && entry.endsWith(fail[name]!)) throw new Error(`falhou: ${entry}`)
  }
  const io: QueueIo = {
    gather: (n) => ({ sha: `sha${n}`, approved: approvedHeads.has(n), pr: { ...prs[n] } }),
    listDependents: (head) => {
      step('listDependents', `list ${head}`)
      return dependentsOf(head, Object.entries(prs)
        .filter(([, p]) => p.state === 'OPEN')
        .map(([number, p]) => ({ number, baseRefName: p.baseRefName })))
    },
    approve: (n, sha) => step('approve', `approve ${n}@${sha}`),
    merge: (n, sha) => {
      step('merge', `merge ${n}@${sha}`)
      prs[n].state = 'MERGED'
    },
    retarget: (n) => {
      step('retarget', `retarget ${n}`)
      prs[n].baseRefName = MERGE_BASE
    },
    deleteBranch: (b) => step('deleteBranch', `delete ${b}`),
    dispatch: (n) => step('dispatch', `dispatch ${n}`),
    log: () => {},
  }
  return { io, calls }
}

describe('argumentos do gh na pilha (SPEC-0739, pilha TDR-0014)', () => {
  it('merge só no head avaliado e sem apagar a branch', () => {
    const args = mergeArgs('15', REPO, 'abc123')
    expect(args.slice(0, 5)).toEqual(['pr', 'merge', '15', '-R', REPO])
    expect(args).toContain('--merge')
    expect(args[args.indexOf('--match-head-commit') + 1]).toBe('abc123')
    expect(args).not.toContain('--delete-branch')
  })

  it('aprova pela API no head avaliado, com o motivo (SPEC-0739)', () => {
    const args = approveArgs('15', REPO, 'abc123')
    expect(args.slice(0, 4)).toEqual(['api', '-X', 'POST', `repos/${REPO}/pulls/15/reviews`])
    expect(args).toContain('commit_id=abc123')
    expect(args).toContain('event=APPROVE')
    expect(args).toContain(`body=${APPROVE_BODY}`)
  })

  it('redireciona para a main e apaga a branch pela API, nunca a main', () => {
    expect(retargetArgs('7', REPO)).toEqual(['api', '-X', 'PATCH', `repos/${REPO}/pulls/7`, '-f', 'base=main'])
    expect(deleteBranchArgs(REPO, 'perf/fase 3')).toEqual(
      ['api', '-X', 'DELETE', `repos/${REPO}/git/refs/heads/perf/fase%203`])
    expect(() => deleteBranchArgs(REPO, MERGE_BASE)).toThrow()
    expect(() => deleteBranchArgs(REPO, '')).toThrow()
  })

  it('dispara o auto-merge do dependente pela main', () => {
    expect(dispatchArgs('9', REPO)).toEqual(
      ['workflow', 'run', AUTO_MERGE_WORKFLOW, '-R', REPO, '--ref', MERGE_BASE, '-f', 'pr=9'])
  })

  it('dependentes: só os que miram a branch, em ordem crescente', () => {
    expect(dependentsOf('perf/fase2', [
      { number: 31, baseRefName: 'perf/fase2' },
      { number: 9, baseRefName: 'perf/fase2' },
      { number: 12, baseRefName: 'main' },
    ])).toEqual(['9', '31'])
  })

  it('ref inexistente (404/422) é ignorável; outro erro não', () => {
    expect(isMissingRef({ stderr: 'gh: Reference does not exist (HTTP 422)' })).toBe(true)
    expect(isMissingRef(new Error('gh: Not Found (HTTP 404)'))).toBe(true)
    expect(isMissingRef({ stderr: 'gh: Resource not accessible by integration (HTTP 403)' })).toBe(false)
    expect(isMissingRef(undefined)).toBe(false)
  })

  it('PR empilhado não é mergeado: espera a base entrar', () => {
    const r = evaluate(pr('perf/fase3', 'perf/fase2'))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('perf/fase2')
  })
})

describe('fila da pilha (SPEC-0739, pilha TDR-0014)', () => {
  it('mergeia só o PR do grupo e dispara os dependentes depois de redirecionar e apagar', () => {
    const { io, calls } = fakeGitHub({
      '1': pr('perf/fase2', 'main'),
      '2': pr('perf/fase3', 'perf/fase2'),
      '3': pr('perf/fase3b', 'perf/fase2'),
      '4': pr('perf/fase4', 'perf/fase3'),
    })
    expect(runQueue(['1'], io)).toEqual({ merged: ['1'], dispatched: ['2', '3'] })
    expect(calls).toEqual([
      'list perf/fase2', 'approve 1@sha1', 'merge 1@sha1', 'retarget 2', 'retarget 3', 'delete perf/fase2', 'dispatch 2', 'dispatch 3',
    ])
  })

  it('a execução do dependente desce o próximo degrau', () => {
    const { io, calls } = fakeGitHub({
      '1': pr('a', 'main', { state: 'MERGED' }),
      '2': pr('b', 'main'),
      '3': pr('c', 'b'),
    })
    expect(runQueue(['2'], io)).toEqual({ merged: ['2'], dispatched: ['3'] })
    expect(calls).toEqual(['list b', 'approve 2@sha2', 'merge 2@sha2', 'retarget 3', 'delete b', 'dispatch 3'])
  })

  it('PRs extras do evento vão para a execução deles, sem repetir dependente', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main'), '2': pr('b', 'a'), '5': pr('e', 'main') })
    expect(runQueue(['1', '2', '5', '1'], io)).toEqual({ merged: ['1'], dispatched: ['2', '5'] })
    expect(calls.filter((c) => c.startsWith('merge'))).toEqual(['merge 1@sha1'])
    expect(calls.slice(-2)).toEqual(['dispatch 2', 'dispatch 5'])
  })

  it('aprova o head avaliado logo antes de mesclar (SPEC-0739)', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main') })
    runQueue(['1'], io)
    expect(calls.indexOf('approve 1@sha1')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('approve 1@sha1')).toBe(calls.indexOf('merge 1@sha1') - 1)
  })

  it('head já aprovado pelo review não ganha outra aprovação (SPEC-0739)', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main') }, {}, new Set(['1']))
    runQueue(['1'], io)
    expect(calls.some((c) => c.startsWith('approve'))).toBe(false)
    expect(calls).toContain('merge 1@sha1')
  })

  it('falha na aprovação lança e não mescla nada (SPEC-0739)', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main'), '2': pr('b', 'a') }, { approve: 'approve 1@sha1' })
    expect(() => runQueue(['1'], io)).toThrow()
    expect(calls).toEqual(['list a', 'approve 1@sha1'])
  })

  it('PR reprovado não lista, não aprova, não mergeia e não apaga nada', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main', { failing: ['Tests (Vitest)'] }), '2': pr('b', 'a') })
    expect(runQueue(['1'], io)).toEqual({ merged: [], dispatched: [] })
    expect(calls).toEqual([])
  })

  it('falha no redirecionamento de um dependente: os outros seguem, a branch fica e o job lança', () => {
    const { io, calls } = fakeGitHub(
      { '1': pr('a', 'main'), '2': pr('b', 'a'), '3': pr('c', 'a') }, { retarget: 'retarget 2' },
    )
    expect(() => runQueue(['1'], io)).toThrow(/#2/)
    expect(calls).toEqual(['list a', 'approve 1@sha1', 'merge 1@sha1', 'retarget 2', 'retarget 3', 'dispatch 3'])
  })

  it('falha no merge lança antes de redirecionar ou apagar', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main'), '2': pr('b', 'a') }, { merge: 'merge 1@sha1' })
    expect(() => runQueue(['1'], io)).toThrow()
    expect(calls).toEqual(['list a', 'approve 1@sha1', 'merge 1@sha1'])
  })

  it('PR empilhado pedido sozinho só espera', () => {
    const { io, calls } = fakeGitHub({ '1': pr('a', 'main', { failing: ['Tests (Vitest)'] }), '2': pr('b', 'a') })
    expect(runQueue(['2'], io)).toEqual({ merged: [], dispatched: [] })
    expect(calls).toEqual([])
  })

  it('sem PR no evento não faz nada', () => {
    const { io, calls } = fakeGitHub({})
    expect(runQueue([], io)).toEqual({ merged: [], dispatched: [] })
    expect(calls).toEqual([])
  })
})
