/** SPEC-0656 — regras do repo no PR dos jogos: o script que o template de projeto leva em `.github/`. */
import { describe, expect, it } from 'vitest'

// @ts-expect-error — script de CI do template, sem d.ts
import { checkRules, parseAddedLines, MAX_LINES } from '../../templates/new-project/.github/scripts/pr-rules.mjs'

const file = (path: string, lines = 10, status = 'M') => ({ status, path, lines })
const run = (files: ReturnType<typeof file>[], pendencias = '') => checkRules({ files, added: [], pendencias })

/**
 * Erros de console.log com o arquivo inteiro `source` no head e as linhas `added` (a partir de 1) adicionadas no
 * diff — todas, sem `added`.
 */
function logErrs(source: string, added?: number[], path = 'game/a.ts'): number {
  const lines = source.split('\n')
  const which = added ?? lines.map((_, i) => i + 1)
  const diff = which.map((line) => ({ path, text: lines[line - 1]!, line }))
  return checkRules({ files: [], added: diff, pendencias: '', sources: { [path]: source } }).errors.length
}

describe('pr-rules do template (SPEC-0656)', () => {
  it('reprova código do jogo acima do limite fora das pendências', () => {
    expect(run([file('game/city.ts', MAX_LINES + 1)]).errors).toHaveLength(1)
    expect(run([file('main.ts', MAX_LINES + 1)]).errors).toHaveLength(1)
    expect(run([file('game/city.ts', MAX_LINES + 1)], 'game/city.ts\n').errors).toHaveLength(0)
  })

  it('isenta engine vendorizada, dependências e build', () => {
    const big = MAX_LINES * 2
    expect(run([file('vendor/cortex-game-engine/index.js', big), file('dist/x.js', big), file('src-tauri/src/main.rs', big)]).errors).toHaveLength(0)
  })

  it('reprova package-lock.json', () => {
    expect(run([file('package-lock.json', 1, 'A')]).errors).toHaveLength(1)
  })

  it('reprova console.log no código do jogo, mas não em scripts, testes ou comentários', () => {
    expect(logErrs("  console.log('x')")).toBe(1)
    expect(logErrs("console.log('x')", undefined, 'scripts/tool.mjs')).toBe(0)
    expect(logErrs("console.log('x')", undefined, 'tests/a.test.ts')).toBe(0)
    expect(logErrs("// console.log('x')")).toBe(0)
  })

  it('avisa código sem SPEC/ADR/TDR, e não avisa com registro', () => {
    expect(run([file('game/a.ts')]).warnings).toHaveLength(1)
    expect(run([file('game/a.ts'), file('docs/specs/SPEC-0001-a.md', 5, 'A')]).warnings).toHaveLength(0)
    expect(run([file('README.md')]).warnings).toHaveLength(0)
  })
})

describe('pr-rules: revisão do PR (pendências exatas, console.log, leitura do diff)', () => {
  it('pendência só libera o caminho exato', () => {
    const big = MAX_LINES + 1
    expect(run([file('game/city.ts', big)], 'game/city.tsx\n').errors).toHaveLength(1)
    expect(run([file('main.ts', big)], 'systems/main.ts\n').errors).toHaveLength(1)
    expect(run([file('game/city.ts', big)], '- `game/city.ts`\n').errors).toHaveLength(0)
  })

  it('console.log: comentário e string não contam; espaço e quebra de linha contam', () => {
    expect(logErrs("const speed = 1 // console.log('speed')")).toBe(0)
    expect(logErrs("const s = 'console.log(x)'")).toBe(0)
    expect(logErrs('/* console.log(x) */ const a = 1')).toBe(0)
    expect(logErrs("console.log ('speed')")).toBe(1)
    expect(logErrs("console\n  .log('speed')")).toBe(1)
  })

  it('console.log: o arquivo inteiro decide o que é comentário ou string, o diff decide o que é novo', () => {
    // bloco de 3 linhas com a chamada dentro: comentário, não reprova
    expect(logErrs("/*\nconsole.log('exemplo')\n*/")).toBe(0)
    // a abertura do bloco mudou, o `*/` ficou fora do diff: a chamada depois dele é código e é nova
    expect(logErrs("/* cabeçalho novo\n*/\nconsole.log('x')", [1, 3])).toBe(1)
    // crase fechando string de várias linhas (aberta fora do diff), depois a chamada real
    expect(logErrs("const t = `linha\nfim` ; console.log('x')", [2])).toBe(1)
    // chamada antiga, fora das linhas adicionadas: não reprova o PR
    expect(logErrs("console.log('velho')\nconst novo = 1", [2])).toBe(0)
  })

  it('parseAddedLines: vários arquivos, exclusão, caminho entre aspas, ++ e o número da linha', () => {
    const patch = [
      'diff --git a/game/a.ts b/game/a.ts',
      '--- a/game/a.ts',
      '+++ b/game/a.ts',
      '@@ -1,0 +5,2 @@',
      "+console.log('a')",
      '+++counter',
      'diff --git a/game/old.ts b/game/old.ts',
      '--- a/game/old.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
      'diff --git "a/game/c\\"x.ts" "b/game/c\\"x.ts"',
      '--- "a/game/c\\"x.ts"',
      '+++ "b/game/c\\"x.ts"',
      '@@ -0,0 +1 @@',
      '+const q = 1',
    ].join('\n')
    expect(parseAddedLines(patch)).toEqual([
      { path: 'game/a.ts', text: "console.log('a')", line: 5 },
      { path: 'game/a.ts', text: '++counter', line: 6 },
      { path: 'game/c"x.ts', text: 'const q = 1', line: 1 },
    ])
  })
})
