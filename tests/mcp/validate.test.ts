/**
 * `validate_scene` do MCP `cortex` (SPEC-0737): overlay ausente ou ilegível é erro, nunca "0 erros" sem ele.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateSceneTool } from '../../mcp/tools/validate.js'
import type { ToolContext } from '../../mcp/toolDef.js'

let root: string
let ctx: ToolContext
const text = (r: { content: Array<{ type: string; text?: string }> }) => r.content.map((c) => c.text ?? '').join('')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cortex-mcp-validate-'))
  mkdirSync(join(root, 'scenes'))
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'scenes', 'fase.json'), '{}')
  ctx = { projectRoot: root, kitsDir: undefined, docsDir: undefined, blenderBin: 'blender' }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('validate_scene / overlay', () => {
  it('overlay informado que não existe é erro', async () => {
    const r = await validateSceneTool.handler({ overlay: 'assets/scene-data-fase2.json' }, ctx)
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Overlay não encontrado: assets/scene-data-fase2.json')
  })

  it('overlay informado com JSON inválido é erro', async () => {
    writeFileSync(join(root, 'assets', 'fase2.json'), '{ quebrado')
    const r = await validateSceneTool.handler({ overlay: 'assets/fase2.json' }, ctx)
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Overlay ilegível')
  })

  it('overlay default com JSON inválido também é erro', async () => {
    writeFileSync(join(root, 'assets', 'scene-data.json'), 'nada')
    const r = await validateSceneTool.handler({}, ctx)
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('assets/scene-data.json')
  })

  it('sem overlay default, segue para as cenas (sem erro de overlay)', async () => {
    const r = await validateSceneTool.handler({}, ctx)
    expect(text(r)).not.toContain('Overlay')
  })
})
