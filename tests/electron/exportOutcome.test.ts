/**
 * Resultado do export no Studio (SPEC-0741).
 *
 * O filho às vezes aborta no encerramento do Node DEPOIS do export pronto
 * (Windows: "PostQueuedCompletionStatus: (6)"). Estes testes travam que o
 * Studio conta como pronto só quando os dois marcadores de conclusão saíram.
 */
import { describe, it, expect } from 'vitest'
import { crashAfterDoneNotice, exportOutcome } from '../../electron/main/exportOutcome.js'

const DONE = '[export:step] done\n'
const OK = '[export] OK → F:\builds\jogo (12 itens na raiz)\n[export] rode: F:\builds\jogo\launcher.exe\n'
const CRASH = 'PostQueuedCompletionStatus: (6) Identificador inválido.\n'
const CRASH_CODE = 3

describe('exportOutcome', () => {
  it('código 0 é pronto', () => {
    expect(exportOutcome(0, '')).toEqual({ ok: true, crashedAfterDone: false })
  })

  it('código ≠ 0 depois dos dois marcadores é pronto, marcado como crash no fim', () => {
    expect(exportOutcome(CRASH_CODE, `[export:step] assets\n${DONE}${OK}${CRASH}`)).toEqual({
      ok: true,
      crashedAfterDone: true,
    })
  })

  it('código ≠ 0 sem os marcadores é falha', () => {
    expect(exportOutcome(1, '[export:step] assets\nErro: EPERM\n')).toEqual({ ok: false, crashedAfterDone: false })
  })

  it('só um dos marcadores não basta', () => {
    expect(exportOutcome(CRASH_CODE, DONE + CRASH).ok).toBe(false)
    expect(exportOutcome(CRASH_CODE, OK + CRASH).ok).toBe(false)
  })

  it('código null (morto por sinal) segue a mesma regra', () => {
    expect(exportOutcome(null, DONE + OK).ok).toBe(true)
    expect(exportOutcome(null, '[export:step] bundle\n').ok).toBe(false)
  })

  it('marcador no meio de uma linha não conta', () => {
    expect(exportOutcome(CRASH_CODE, `log: [export:step] done\nlog: [export] OK → x\n`).ok).toBe(false)
  })

  it('o aviso cita o código e diz que o export está completo', () => {
    const notice = crashAfterDoneNotice(CRASH_CODE)
    expect(notice).toContain('código 3')
    expect(notice).toContain('o export está completo')
    expect(notice.endsWith('\n')).toBe(true)
  })
})
