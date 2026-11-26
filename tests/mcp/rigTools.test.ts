/**
 * Ferramentas `rig_*` do MCP `cortex` (SPEC-0746) contra uma ponte de verdade com um painel falso: o arquivo da ponte,
 * o repasse, o erro do painel, a foto gravada e o Studio fechado.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startBridgeServer } from '../../electron/main/rigBridge/bridgeServer.js'
import { RIG_BRIDGE_FILE_ENV } from '../../electron/main/rigBridge/bridgeFile.js'
import { rigTools } from '../../mcp/tools/rig.js'
import type { ToolContext, ToolDef } from '../../mcp/toolDef.js'

const TOKEN = 'tok'
/** PNG de 1 pixel. */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
let dir = ''
let server: Server
const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []
const prevEnv = process.env[RIG_BRIDGE_FILE_ENV]

const tool = (name: string): ToolDef => rigTools.find((t) => t.name === name) as unknown as ToolDef
const ctx = (): ToolContext => ({ projectRoot: dir, kitsDir: undefined, docsDir: undefined, blenderBin: 'blender' })
const text = (r: { content: Array<{ type: string; text?: string }> }): string => r.content.find((c) => c.type === 'text')?.text ?? ''

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rigtools-'))
  server = await startBridgeServer(TOKEN, async (cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'snapshot') return { ok: true, result: { png: PNG_1PX, width: 1, height: 1 } }
    if (cmd === 'supportHand') return { ok: false, error: 'sem arma na mão' }
    return { ok: true, result: { cmd, grip: { offsetCm: [0, 8, 0] } } }
  })
  const file = join(dir, 'bridge.json')
  writeFileSync(file, JSON.stringify({ port: (server.address() as AddressInfo).port, token: TOKEN, pid: process.pid }))
  process.env[RIG_BRIDGE_FILE_ENV] = file
})

afterAll(() => {
  server.close()
  if (prevEnv === undefined) delete process.env[RIG_BRIDGE_FILE_ENV]
  else process.env[RIG_BRIDGE_FILE_ENV] = prevEnv
  rmSync(dir, { recursive: true, force: true })
})

describe('ferramentas rig_*', () => {
  it('cada ferramenta manda o comando dela com os argumentos', async () => {
    const r = await tool('rig_nudge_grip').handler({ moveCm: [0.1, 0, 0] } as never, ctx())
    expect(calls.at(-1)).toEqual({ cmd: 'nudgeGrip', args: { moveCm: [0.1, 0, 0] } })
    expect(JSON.parse(text(r))).toMatchObject({ cmd: 'nudgeGrip' })
    const pairs: Array<[string, string, Record<string, unknown>]> = [
      ['rig_state', 'state', {}],
      ['rig_set_grip', 'setGrip', { offsetCm: [1, 2, 3] }],
      ['rig_clip', 'clip', { name: 'pistolIdle', weapon: 'ARM-04', time: 0.5 }],
      ['rig_camera', 'camera', { view: 'right', focus: 'RightHand' }],
      ['rig_measure', 'measure', {}],
      ['rig_save', 'save', { target: 'pose' }],
    ]
    for (const [name, cmd, args] of pairs) {
      await tool(name).handler(args as never, ctx())
      expect(calls.at(-1)).toEqual({ cmd, args })
    }
  })

  it('erro do painel volta como erro da ferramenta', async () => {
    await expect(tool('rig_support_hand').handler({} as never, ctx())).rejects.toThrow(/sem arma na mão/)
  })

  it('rig_snapshot grava o PNG no projeto e devolve a imagem', async () => {
    const r = await tool('rig_snapshot').handler({} as never, ctx())
    const path = text(r).split(' (')[0]!
    expect(path.startsWith(join(dir, '.cortex', 'rig'))).toBe(true)
    expect(readFileSync(path).toString('base64')).toBe(PNG_1PX)
    expect(r.content.some((c) => c.type === 'image')).toBe(true)
    const named = await tool('rig_snapshot').handler({ file: 'fotos/a.png' } as never, ctx())
    expect(existsSync(join(dir, 'fotos', 'a.png'))).toBe(true)
    expect(text(named)).toContain('a.png')
  })

  it('Studio fechado: diz que não está aberto', async () => {
    process.env[RIG_BRIDGE_FILE_ENV] = join(dir, 'nao-existe.json')
    try {
      await expect(tool('rig_state').handler({} as never, ctx())).rejects.toThrow(/Studio não está aberto/)
    } finally {
      process.env[RIG_BRIDGE_FILE_ENV] = join(dir, 'bridge.json')
    }
  })
})
