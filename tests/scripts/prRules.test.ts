import { describe, expect, it } from 'vitest'
import { checkRules, parseAddedLines, MAX_LINES } from '../../.github/scripts/pr-rules.mjs'

const file = (path: string, lines = 10, status = 'M') => ({ status, path, lines })
const run = (files: ReturnType<typeof file>[], added: { path: string; text: string }[] = [], pendencias = '') =>
  checkRules({ files, added, pendencias })

describe('pr-rules (SPEC-0654)', () => {
  it('reprova package-lock.json', () => {
    expect(run([file('package-lock.json', 1, 'A')]).errors).toHaveLength(1)
  })

  it('reprova código acima do limite fora das pendências', () => {
    expect(run([file('src/a.ts', MAX_LINES + 1)]).errors).toHaveLength(1)
    expect(run([file('src/a.ts', MAX_LINES)]).errors).toHaveLength(0)
    expect(run([file('src/a.ts', MAX_LINES + 1)], [], '- src/a.ts\n').errors).toHaveLength(0)
  })

  it('isenta terceiros, dados e arquivos removidos', () => {
    const big = MAX_LINES * 2
    expect(run([file('native/third_party/x.cpp', big), file('native/rapier-native/patched/a.rs', big)]).errors).toHaveLength(0)
    expect(run([file('src/data.json', big), file('src/a.ts', big, 'D')]).errors).toHaveLength(0)
  })

  it('reprova console.log adicionado no engine, fora das exceções e comentários', () => {
    const log = 'console.log("x")'
    expect(run([], [{ path: 'src/core/a.ts', text: `  ${log}` }]).errors).toHaveLength(1)
    expect(run([], [{ path: 'src/cli/index.ts', text: log }]).errors).toHaveLength(0)
    expect(run([], [{ path: 'src/core/a.ts', text: `// ${log}` }]).errors).toHaveLength(0)
    expect(run([], [{ path: 'electron/main.ts', text: log }]).errors).toHaveLength(0)
  })

  it('avisa (sem reprovar) código sem registro', () => {
    expect(run([file('src/a.ts')]).warnings).toHaveLength(1)
    expect(run([file('src/a.ts'), file('docs/specs/SPEC-1-x.md')]).warnings).toHaveLength(0)
    expect(run([file('docs/x.md')]).warnings).toHaveLength(0)
  })

  it('extrai linhas adicionadas do diff -U0', () => {
    const patch = ['+++ b/src/a.ts', '@@ -1 +1 @@', '-old', '+new', '+++ /dev/null', '+ignored'].join('\n')
    expect(parseAddedLines(patch)).toEqual([{ path: 'src/a.ts', text: 'new' }])
  })
})
