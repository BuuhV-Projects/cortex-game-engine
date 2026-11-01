/** SPEC-0656 — regras do repo no PR dos jogos: o script que o template de projeto leva em `.github/`. */
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script de CI do template, sem d.ts
import { checkRules, MAX_LINES } from '../../templates/new-project/.github/scripts/pr-rules.mjs'

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
