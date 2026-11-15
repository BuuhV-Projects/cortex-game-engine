/**
 * Contexto do MCP `cortex` (SPEC-0737): onde acha os recursos do Studio e o projeto do jogo.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
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
  // `resolve(sep, …)` é absoluto no Windows e no Linux; `join('D:', …)` não é no Linux (CI).
  const cwd = resolve(sep, 'jogos', 'meu-jogo')

  it('sem projectDir usa o cwd; relativo resolve contra o cwd', () => {
    expect(resolveProjectRoot(undefined, cwd)).toBe(cwd)
    expect(resolveProjectRoot('sub', cwd)).toBe(join(cwd, 'sub'))
  })

  it('isInside barra caminho que sai do projeto', () => {
    expect(isInside(cwd, 'scenes/a.json')).toBe(true)
    expect(isInside(cwd, '../outro/a.json')).toBe(false)
    expect(isInside(cwd, resolve(sep, 'Windows', 'x.json'))).toBe(false)
    expect(isInside(cwd, '..arquivo.json')).toBe(true)
  })
})

describe('isInside com link no disco', () => {
  it('link dentro do projeto que aponta para fora conta como fora; pasta real do projeto, dentro', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cortex-mcp-link-'))
    try {
      const proj = join(tmp, 'jogo')
      const fora = join(tmp, 'fora')
      mkdirSync(join(proj, 'scenes'), { recursive: true })
      mkdirSync(fora)
      // `junction` no Windows não pede admin; nos outros sistemas o tipo é ignorado (symlink de pasta).
      symlinkSync(fora, join(proj, 'atalho'), 'junction')
      expect(isInside(proj, 'atalho/a.json')).toBe(false)
      expect(isInside(proj, join(proj, 'atalho', 'a.json'))).toBe(false)
      expect(isInside(proj, 'scenes/nova.json')).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
