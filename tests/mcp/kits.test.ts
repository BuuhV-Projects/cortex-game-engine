/**
 * Tools de kits do MCP `cortex` (SPEC-0737) com um catálogo de kits falso em disco.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importKit, listKitAssets, listKits } from '../../mcp/tools/kits.js'
import type { ToolContext } from '../../mcp/toolDef.js'

let root: string
let ctx: ToolContext
const text = (r: { content: Array<{ type: string; text?: string }> }) => r.content.map((c) => c.text ?? '').join('')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cortex-mcp-kits-'))
  const kit = join(root, 'kits', 'floresta')
  mkdirSync(join(kit, 'assets'), { recursive: true })
  mkdirSync(join(kit, 'thumbnails'), { recursive: true })
  writeFileSync(join(kit, 'assets', 'arvore.glb'), 'glb')
  writeFileSync(join(kit, 'assets', 'pedra.glb'), 'glb')
  writeFileSync(join(kit, 'thumbnails', 'arvore.png'), 'png')
  writeFileSync(
    join(kit, 'kit.json'),
    JSON.stringify({
      name: 'floresta',
      assets: {
        'assets/arvore.glb': { role: 'decoration', tags: ['forest'], thumb: 'thumbnails/arvore.png' },
        'assets/pedra.glb': { role: 'platform', tags: ['rock'] },
      },
    }),
  )
  mkdirSync(join(root, 'jogo'))
  ctx = { projectRoot: join(root, 'jogo'), kitsDir: join(root, 'kits'), docsDir: undefined, blenderBin: 'blender' }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('tools de kits', () => {
  it('list_kits mostra o kit com contagem por role', async () => {
    const out = text(await listKits.handler({}, ctx))
    expect(out).toContain('| floresta | 2 |')
  })

  it('list_kit_assets filtra por role', async () => {
    const out = text(await listKitAssets.handler({ kit: 'floresta', role: 'platform' }, ctx))
    expect(out).toContain('pedra.glb')
    expect(out).not.toContain('arvore.glb')
  })

  it('import_kit com only copia só o pedido, a thumbnail e o kit.json reescrito', async () => {
    const r = await importKit.handler({ kit: 'floresta', only: ['arvore.glb'] }, ctx)
    expect(r.isError).toBeUndefined()
    const dest = join(ctx.projectRoot, 'assets', 'floresta')
    expect(existsSync(join(dest, 'arvore.glb'))).toBe(true)
    expect(existsSync(join(dest, 'pedra.glb'))).toBe(false)
    expect(existsSync(join(ctx.projectRoot, '.cortex', 'kit-thumbs', 'floresta', 'arvore.png'))).toBe(true)
    const kit = JSON.parse(readFileSync(join(dest, 'kit.json'), 'utf-8'))
    expect(Object.keys(kit.assets)).toEqual(['assets/floresta/arvore.glb'])
  })

  it('import_kit com only que não casa (typo, sem extensão) é erro e não grava nada', async () => {
    const r = await importKit.handler({ kit: 'floresta', only: ['arvore'] }, ctx)
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('arvore')
    expect(existsSync(join(ctx.projectRoot, 'assets'))).toBe(false)
  })

  it('import_kit com only parcial lista o que falta e não grava nada', async () => {
    const r = await importKit.handler({ kit: 'floresta', only: ['arvore.glb', 'pedrra.glb'] }, ctx)
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('pedrra.glb')
    expect(text(r)).not.toContain('arvore.glb,')
    expect(existsSync(join(ctx.projectRoot, 'assets'))).toBe(false)
  })

  it('import_kit sem only cataloga o kit inteiro', async () => {
    const r = await importKit.handler({ kit: 'floresta' }, ctx)
    expect(r.isError).toBeUndefined()
    const kit = JSON.parse(readFileSync(join(ctx.projectRoot, 'assets', 'floresta', 'kit.json'), 'utf-8'))
    expect(Object.keys(kit.assets).sort()).toEqual(['assets/floresta/arvore.glb', 'assets/floresta/pedra.glb'])
  })

  it('kit fora do catálogo (../) é recusado sem copiar nada', async () => {
    const r = await importKit.handler({ kit: '../jogo' }, ctx)
    expect(r.isError).toBe(true)
    expect(existsSync(join(ctx.projectRoot, 'assets'))).toBe(false)
  })

  it('sem kits empacotados, list_kits avisa', async () => {
    expect(text(await listKits.handler({}, { ...ctx, kitsDir: undefined }))).toContain('Nenhum kit')
  })
})
