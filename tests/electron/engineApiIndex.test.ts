/**
 * Testes do gerador de índice da referência da API (ADR-0114):
 * parsing de seções (níveis, faixas de linha, code fences), extração de
 * símbolos (tabela = 1ª célula; prosa = identificadores puros em crase) e
 * montagem do índice injetado no system prompt. Inclui um teste de integração
 * contra o engine-api.md real (garante a economia de tokens).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  parseEngineApiSections,
  buildEngineApiIndex,
} from '../../electron/agent/engineApiIndex.js'

const SAMPLE = `# Título do doc

Preâmbulo com regra de import de \`'cortex-game-engine'\`.

---

## Core

| Símbolo | O que é |
|---|---|
| \`Game\` | Facade. \`new Game({ canvas })\`, \`.start()\`. |
| \`Camera\`, \`PerspectiveCamera\` | Câmeras. Ver \`Renderer\`. |

### Física (impulso)
\`RigidBodyComponent\`, \`ColliderComponent\` (+ tipo \`ColliderShape\`), \`PhysicsSystem\`.

## Receitas

Use \`buildScene\` com \`true\` no editor.

\`\`\`ts
## isto não é heading
const fake = \`FakeSymbol\`
\`\`\`

## Fim

Sem símbolos aqui.
`

describe('parseEngineApiSections', () => {
  const sections = parseEngineApiSections(SAMPLE)

  it('acha as seções ## e ### com níveis e linhas 1-based', () => {
    expect(sections.map((s) => s.title)).toEqual([
      'Core',
      'Física (impulso)',
      'Receitas',
      'Fim',
    ])
    expect(sections.map((s) => s.level)).toEqual([2, 3, 2, 2])
    const core = sections[0]
    // "## Core" está na linha 7 do SAMPLE
    expect(core.startLine).toBe(7)
  })

  it('seção ## engloba a ### filha; ### termina no próximo heading', () => {
    const core = sections[0]
    const fisica = sections[1]
    const receitas = sections[2]
    expect(core.endLine).toBe(receitas.startLine - 1)
    expect(fisica.startLine).toBeGreaterThan(core.startLine)
    expect(fisica.endLine).toBe(receitas.startLine - 1)
  })

  it('ignora headings dentro de code fence', () => {
    expect(sections.some((s) => s.title.includes('isto não é heading'))).toBe(false)
  })

  it('tabela: só a 1ª célula vira símbolo (célula com vírgula gera vários)', () => {
    const core = sections[0]
    expect(core.symbols).toContain('Game')
    expect(core.symbols).toContain('Camera')
    expect(core.symbols).toContain('PerspectiveCamera')
    // Da descrição (2ª célula) nada entra — nem `Renderer` citado lá.
    expect(core.symbols).not.toContain('Renderer')
  })

  it('prosa: identificadores puros em crase entram; stoplist e código de fence não', () => {
    const fisica = sections[1]
    expect(fisica.symbols).toEqual([
      'RigidBodyComponent',
      'ColliderComponent',
      'ColliderShape',
      'PhysicsSystem',
    ])
    const receitas = sections[2]
    expect(receitas.symbols).toContain('buildScene')
    expect(receitas.symbols).not.toContain('true') // stoplist
    expect(receitas.symbols).not.toContain('FakeSymbol') // dentro do fence
  })

  it('seção sem símbolos fica com lista vazia', () => {
    expect(sections[3].symbols).toEqual([])
  })
})

describe('buildEngineApiIndex', () => {
  const index = buildEngineApiIndex(SAMPLE, 'C:\\studio\\docs\\engine-api.md')

  it('inclui preâmbulo, caminho do doc e instrução de Read com offset/limit', () => {
    expect(index).toContain('Preâmbulo com regra de import')
    expect(index).toContain('C:\\studio\\docs\\engine-api.md')
    expect(index).toMatch(/offset=414, limit=75/) // exemplo de uso na instrução
  })

  it('lista cada seção com faixa de linhas e símbolos; ### indentada', () => {
    expect(index).toMatch(/^- Core — L7-\d+ — Game, Camera, PerspectiveCamera/m)
    expect(index).toMatch(/^ {2}- Física \(impulso\) — L\d+-\d+ — RigidBodyComponent/m)
    expect(index).toMatch(/^- Fim — L\d+-\d+$/m)
  })
})

describe('engine-api.md real (integração)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const docPath = join(here, '..', '..', 'docs', 'cortex-game-engine', 'engine-api.md')
  const doc = readFileSync(docPath, 'utf-8')

  it('parseia dezenas de seções com símbolos do engine', () => {
    const sections = parseEngineApiSections(doc)
    expect(sections.length).toBeGreaterThan(30)
    const all = sections.flatMap((s) => s.symbols)
    for (const expected of ['Game', 'World', 'Entity', 'buildScene']) {
      expect(all).toContain(expected)
    }
  })

  it('índice é uma fração pequena do doc (economia de tokens real)', () => {
    const index = buildEngineApiIndex(doc, 'X:\\qualquer\\engine-api.md')
    expect(index.length).toBeLessThan(doc.length * 0.25)
  })
})
