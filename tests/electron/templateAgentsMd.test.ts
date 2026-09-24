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

describe('template de projeto novo: performance desde o início (SPEC-0268)', () => {
  /**
   * Conceitos que TÊM que estar nas duas fontes — o AGENTS.md do projeto e as
   * regras do Chat IA. Se uma mudar sem a outra, este teste acusa.
   */
  const CONCEITOS = [
    'mesmo acabamento',
    'materiais por primitiva',
    'game.precompile()',
    'InstancedMesh',
    'pass()',
    'game.maxFps',
    'game.refreshHz',
  ]

  it('o AGENTS.md traz as regras de performance', async () => {
    const md = read(AGENTS_MD)
    const { PERFORMANCE_RULES } = await import('../../electron/agent/performanceRules.js')
    for (const conceito of CONCEITOS) {
      expect(md, `AGENTS.md sem "${conceito}"`).toContain(conceito)
      expect(PERFORMANCE_RULES, `performanceRules.ts sem "${conceito}"`).toContain(conceito)
    }
  })

  it('o main.ts monta tudo sob o carregamento e aquece antes de liberar o jogo', () => {
    const main = read(join(TEMPLATE_DIR, 'main.ts'))
    const idx = (s: string) => main.indexOf(s)
    // Ordem: liga o carregamento → monta → aquece → libera, e libera num finally.
    expect(idx('game.setLoading(true)')).toBeGreaterThan(-1)
    expect(idx('await buildScene(')).toBeGreaterThan(idx('game.setLoading(true)'))
    expect(idx('await game.precompile()')).toBeGreaterThan(idx('await buildScene('))
    expect(main).toMatch(/finally\s*\{[\s\S]*game\.setLoading\(false\)/)
    // O aquecimento do build seria segundos de trabalho errado (ADR-0262).
    expect(main).toContain('precompile: false')
    // A tela de carregamento é da engine: funciona no Studio e no export.
    expect(main).toContain('createLoadingScreen(game.ui')
  })

  it('o teto de fps fica como escolha do jogo, não imposto pelo template', () => {
    const main = read(join(TEMPLATE_DIR, 'main.ts'))
    expect(main).toMatch(/^\/\/ game\.maxFps = /m)
    expect(main).not.toMatch(/^game\.maxFps = /m)
  })
})
