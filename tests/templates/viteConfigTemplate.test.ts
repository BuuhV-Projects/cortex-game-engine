/**
 * O vite de cada raiz varre só a si mesma (SPEC-0696). O template não pode ser
 * importado aqui (ele importa o engine vendorizado do projeto), então a guarda é
 * no texto: as duas linhas que, se sumirem, trazem o travamento de volta.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const TEMPLATE = readFileSync(new URL('../../templates/new-project/vite.config.ts', import.meta.url), 'utf8')
/** Código sem comentários — a explicação do template cita o glob proibido de propósito. */
const CODE = TEMPLATE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('templates/new-project/vite.config.ts — varredura isolada por raiz', () => {
  it('o pré-bundle parte só do index.html da raiz', () => {
    expect(CODE).toMatch(/optimizeDeps:\s*\{\s*entries:\s*\['index\.html'\]/)
  })

  it('o watcher ignora as pastas de ferramenta por caminho absoluto, nunca pelo glob **/.claude/**', () => {
    expect(CODE).toMatch(/ignored:\s*\[[^\]]*isToolPath/)
    expect(CODE).toMatch(/resolve\(__dirname, d\)/)
    expect(CODE).not.toContain('**/.claude/**')
  })
})
