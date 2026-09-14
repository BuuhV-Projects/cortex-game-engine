/**
 * Garante que o `AGENTS.md` do template de projeto novo carrega os contratos
 * que saíram do system prompt no ADR-0191.
 *
 * Sem este teste a mudança seria uma perda líquida: as regras sairiam do prompt
 * e ninguém garantiria que chegaram ao outro lado.
 *
 * @see ADR-0191 / SPEC-0192
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEMPLATE_DIR = join(process.cwd(), 'templates', 'new-project')
const AGENTS_MD = join(TEMPLATE_DIR, 'AGENTS.md')
const CLAUDE_MD = join(TEMPLATE_DIR, 'CLAUDE.md')

const read = (p: string): string => readFileSync(p, 'utf-8')

describe('templates/new-project/AGENTS.md', () => {
  it('existe no template', () => {
    expect(existsSync(AGENTS_MD)).toBe(true)
  })

  it('exige cena como dado (scenes/*.json), não código', () => {
    const md = read(AGENTS_MD)
    expect(md).toMatch(/scenes\/\*\.json/)
    expect(md).toMatch(/buildScene/)
  })

  it('exige física nos campos do nó, com o motivo (some do Inspector)', () => {
    const md = read(AGENTS_MD)
    expect(md).toMatch(/collider/)
    expect(md).toMatch(/character/)
    expect(md).toMatch(/Inspector/)
  })

  it('exige place assentando pela base, não y chutado', () => {
    const md = read(AGENTS_MD)
    expect(md).toMatch(/place/)
    expect(md).toMatch(/base/i)
    expect(md).toMatch(/pivô/i)
  })

  it('proíbe id sequencial e explica o efeito no overlay do editor', () => {
    const md = read(AGENTS_MD)
    expect(md).toMatch(/nunca é sequencial/i)
    expect(md).toMatch(/base36/)
    expect(md).toMatch(/overlay/i)
  })

  it('exige import de cortex-game-engine e proíbe three', () => {
    const md = read(AGENTS_MD)
    expect(md).toMatch(/'cortex-game-engine'/)
    expect(md).toMatch(/nunca de `'three'`/i)
  })

  it('proíbe build/dev dentro do projeto e aponta tsc --noEmit', () => {
    const md = read(AGENTS_MD)
    for (const cmd of ['yarn build', 'yarn dev', 'vite build', 'tsc -b']) {
      expect(md).toContain(cmd)
    }
    expect(md).toContain('tsc --noEmit')
  })

  it('explica o PORQUÊ de cada regra — são falhas silenciosas', () => {
    const md = read(AGENTS_MD)
    // Uma regra sem motivo é a primeira que o agente descarta quando conflita
    // com o pedido do usuário.
    const motivos = md.match(/Por quê:/g) ?? []
    expect(motivos.length).toBeGreaterThanOrEqual(5)
  })
})

describe('templates/new-project/CLAUDE.md', () => {
  it('existe e aponta para o AGENTS.md (fonte única das duas cabeças)', () => {
    expect(existsSync(CLAUDE_MD)).toBe(true)
    expect(read(CLAUDE_MD)).toContain('AGENTS.md')
  })
})
