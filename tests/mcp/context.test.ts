/**
 * Contexto do MCP `cortex` (SPEC-0737): onde acha os recursos do Studio e o projeto do jogo.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { findResources, isInside, resolveProjectRoot } from '../../mcp/context.js'

const ROOT = join('C:', 'Studio', 'resources')
const SCRIPT_DIR = join(ROOT, 'mcp')

describe('findResources', () => {
  it('acha kits e docs na pasta acima do script (layout empacotado)', () => {
    const exists = (p: string) => p === join(ROOT, 'kits') || p === join(ROOT, 'docs', 'cortex-game-engine')
    const res = findResources(SCRIPT_DIR, {}, exists)
    expect(res.base).toBe(ROOT)
    expect(res.kitsDir).toBe(join(ROOT, 'kits'))
    expect(res.docsDir).toBe(join(ROOT, 'docs', 'cortex-game-engine'))
  })

  it('sobe dois níveis no layout do repo (out/mcp → raiz)', () => {
    const repo = join('C:', 'repo')
    const exists = (p: string) => p === join(repo, 'kits')
    const res = findResources(join(repo, 'out', 'mcp'), {}, exists)
    expect(res.base).toBe(repo)
    expect(res.docsDir).toBeUndefined()
  })

  it('CORTEX_RESOURCES vence a busca pela pasta do script', () => {
    const custom = join('D:', 'custom')
    const exists = (p: string) => p.startsWith(custom) || p.startsWith(ROOT)
    expect(findResources(SCRIPT_DIR, { CORTEX_RESOURCES: custom }, exists).base).toBe(custom)
  })

  it('sem nada, devolve tudo undefined', () => {
    expect(findResources(SCRIPT_DIR, {}, () => false)).toEqual({ base: undefined, kitsDir: undefined, docsDir: undefined })
  })
})

describe('resolveProjectRoot / isInside', () => {
  const cwd = join('D:', 'jogos', 'meu-jogo')

  it('sem projectDir usa o cwd; relativo resolve contra o cwd', () => {
    expect(resolveProjectRoot(undefined, cwd)).toBe(cwd)
    expect(resolveProjectRoot('sub', cwd)).toBe(join(cwd, 'sub'))
  })

  it('isInside barra caminho que sai do projeto', () => {
    expect(isInside(cwd, 'scenes/a.json')).toBe(true)
    expect(isInside(cwd, '../outro/a.json')).toBe(false)
    expect(isInside(cwd, join('C:', 'Windows', 'x.json'))).toBe(false)
  })
})
