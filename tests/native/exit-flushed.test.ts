/**
 * Saída explícita do export depois de esvaziar o stdout (SPEC-0741).
 *
 * O export sai com `exitFlushed(0)` em vez do encerramento natural do Node, que
 * às vezes aborta no Windows. Estes testes travam que nenhuma linha se perde no
 * pipe e que o código pedido é o código de saída.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MODULE_URL = pathToFileURL(path.resolve(__dirname, '../../native/scripts/exit-flushed.mjs')).href
const LINES = 2000

/** Roda um filho que escreve LINES linhas e sai com `exitFlushed(code)`. */
function runChild(code: number) {
  const src =
    `import { exitFlushed } from ${JSON.stringify(MODULE_URL)};` +
    `for (let i = 0; i < ${LINES}; i++) console.log('linha ' + i);` +
    `console.error('fim no stderr');` +
    `exitFlushed(${code});` +
    `setTimeout(() => {}, 60000);`
  return spawnSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8' })
}

describe('exitFlushed', () => {
  it('sai com 0 sem perder linha do stdout nem do stderr', () => {
    const r = runChild(0)
    expect(r.status).toBe(0)
    expect(r.stdout.trim().split('\n')).toHaveLength(LINES)
    expect(r.stdout).toContain(`linha ${LINES - 1}`)
    expect(r.stderr).toContain('fim no stderr')
  })

  it('sai com o código pedido mesmo com timer pendente', () => {
    expect(runChild(2).status).toBe(2)
  })
})
