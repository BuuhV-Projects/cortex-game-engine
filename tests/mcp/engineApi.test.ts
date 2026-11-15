/**
 * Tools `engine_api_*` do MCP `cortex` (SPEC-0737) contra a doc real do repositório.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { findSection, findSymbol, readGuide, searchApi, stripTypedocHeader } from '../../mcp/engineApi/apiReference.js'
import { engineApiIndex, engineApiSearch, engineApiSection, engineApiSymbol } from '../../mcp/tools/engineApi.js'
import type { ToolContext } from '../../mcp/toolDef.js'

const DOCS = join(process.cwd(), 'docs', 'cortex-game-engine')
const ctx: ToolContext = { projectRoot: process.cwd(), kitsDir: undefined, docsDir: DOCS, blenderBin: 'blender' }
const text = (r: { content: Array<{ type: string; text?: string }> }) => r.content.map((c) => c.text ?? '').join('')

describe('apiReference', () => {
  it('acha a referência TypeDoc de um export pelo nome, sem o cabeçalho de navegação', () => {
    const found = findSymbol(DOCS, 'Game')
    expect(found?.entry.kind).toBe('classe')
    expect(found?.text.startsWith('# Class: Game')).toBe(true)
  })

  it('nome sem diferenciar maiúsculas cai no export certo', () => {
    expect(findSymbol(DOCS, 'game')?.entry.name).toBe('Game')
  })

  it('stripTypedocHeader tira breadcrumb e ***', () => {
    const md = '[**cortex-game-engine**](../README.md)\n\n***\n\n[cortex-game-engine](../README.md) / X\n\n# Class: X\n'
    expect(stripTypedocHeader(md)).toBe('# Class: X\n')
  })

  it('findSection acha por título igual ou parcial no guia', () => {
    const md = readGuide(DOCS, 'engine-api')!
    expect(findSection(md, 'Core')?.text.startsWith('## Core')).toBe(true)
    expect(findSection(md, 'nao-existe-xyz')).toBeNull()
  })

  it('busca ranqueia o nome exato primeiro', () => {
    expect(searchApi(DOCS, 'Game', 5)[0]?.name).toBe('Game')
  })
})

describe('tools engine_api_*', () => {
  it('engine_api_index lista os dois guias', async () => {
    const out = text(await engineApiIndex.handler({}, ctx))
    expect(out).toContain('## engine-api.md')
    expect(out).toContain('## architecture.md')
  })

  it('engine_api_symbol corta página longa e avisa', async () => {
    const out = text(await engineApiSymbol.handler({ name: 'Game', maxChars: 200 }, ctx))
    expect(out).toContain('cortado em 200')
  })

  it('engine_api_symbol inexistente é erro com sugestão', async () => {
    const r = await engineApiSymbol.handler({ name: 'NaoExisteNada123' }, ctx)
    expect(r.isError).toBe(true)
  })

  it('engine_api_section e engine_api_search respondem', async () => {
    expect(text(await engineApiSection.handler({ title: 'Core' }, ctx))).toContain('engine-api.md L')
    expect(text(await engineApiSearch.handler({ query: 'vehicle' }, ctx))).toContain('| Nome |')
  })

  it('sem docs nos recursos, toda tool de API devolve erro', async () => {
    const r = await engineApiIndex.handler({}, { ...ctx, docsDir: undefined })
    expect(r.isError).toBe(true)
  })
})
