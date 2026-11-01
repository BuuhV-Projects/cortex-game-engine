/** SPEC-0656 — regras do repo no PR dos jogos: o script que o template de projeto leva em `.github/`. */
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script de CI do template, sem d.ts
import { checkRules, parseAddedLines, MAX_LINES } from '../../templates/new-project/.github/scripts/pr-rules.mjs'

const file = (path: string, lines = 10, status = 'M') => ({ status, path, lines })
const run = (files: ReturnType<typeof file>[], added: { path: string; text: string }[] = [], pendencias = '') =>
  checkRules({ files, added, pendencias })

describe('pr-rules do template (SPEC-0656)', () => {
  it('reprova código do jogo acima do limite fora das pendências', () => {
    expect(run([file('game/city.ts', MAX_LINES + 1)]).errors).toHaveLength(1)
    expect(run([file('main.ts', MAX_LINES + 1)]).errors).toHaveLength(1)
    expect(run([file('game/city.ts', MAX_LINES + 1)], [], 'game/city.ts\n').errors).toHaveLength(0)
  })

  it('isenta engine vendorizada, dependências e build', () => {
    const big = MAX_LINES * 2
    expect(run([file('vendor/cortex-game-engine/index.js', big), file('dist/x.js', big), file('src-tauri/src/main.rs', big)]).errors).toHaveLength(0)
  })

  it('reprova package-lock.json', () => {
    expect(run([file('package-lock.json', 1, 'A')]).errors).toHaveLength(1)
  })

  it('reprova console.log no código do jogo, mas não em scripts, testes ou comentários', () => {
    expect(run([], [{ path: 'game/a.ts', text: "  console.log('x')" }]).errors).toHaveLength(1)
    expect(run([], [{ path: 'scripts/tool.mjs', text: "console.log('x')" }]).errors).toHaveLength(0)
    expect(run([], [{ path: 'tests/a.test.ts', text: "console.log('x')" }]).errors).toHaveLength(0)
    expect(run([], [{ path: 'game/a.ts', text: "// console.log('x')" }]).errors).toHaveLength(0)
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
    expect(run([file('game/city.ts', big)], [], 'game/city.tsx\n').errors).toHaveLength(1)
    expect(run([file('main.ts', big)], [], 'systems/main.ts\n').errors).toHaveLength(1)
    expect(run([file('game/city.ts', big)], [], '- `game/city.ts`\n').errors).toHaveLength(0)
  })

  it('console.log: comentário e string não contam; espaço e quebra de linha contam', () => {
    const errs = (...text: string[]) => run([], text.map((t) => ({ path: 'game/a.ts', text: t }))).errors.length
    expect(errs("const speed = 1 // console.log('speed')")).toBe(0)
    expect(errs("const s = 'console.log(x)'")).toBe(0)
    expect(errs('/* console.log(x) */ const a = 1')).toBe(0)
    expect(errs("console.log ('speed')")).toBe(1)
    expect(errs('console', "  .log('speed')")).toBe(1)
  })

  it('parseAddedLines: vários arquivos, exclusão, caminho entre aspas e linha que começa com ++', () => {
    const patch = [
      'diff --git a/game/a.ts b/game/a.ts',
      '--- a/game/a.ts',
      '+++ b/game/a.ts',
      '@@ -1,0 +1,2 @@',
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
      { path: 'game/a.ts', text: "console.log('a')" },
      { path: 'game/a.ts', text: '++counter' },
      { path: 'game/c"x.ts', text: 'const q = 1' },
    ])
  })
})
