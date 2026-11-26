/**
 * Ponte local do auto-rig (SPEC-0746, ADR-0747): só 127.0.0.1, token, rota, repasse com id e prazo.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_HOST, MAX_BODY_BYTES, startBridgeServer, type RigForward } from '../../electron/main/rigBridge/bridgeServer.js'
import { createForward, REPLY_TIMEOUT_MS, SAVE_TIMEOUT_MS, timeoutFor, type RigCommand } from '../../electron/main/rigBridge/forward.js'
import { RIG_BRIDGE_TOKEN_HEADER, rigBridgeFile } from '../../electron/main/rigBridge/bridgeFile.js'
import { serialQueue } from '../../electron/renderer/serialQueue.js'

const TOKEN = 'abc123'
let server: Server | null = null

async function up(forward: RigForward): Promise<string> {
  server = await startBridgeServer(TOKEN, forward)
  const { address, port } = server.address() as AddressInfo
  expect(address).toBe(BRIDGE_HOST)
  return `http://127.0.0.1:${port}`
}

const post = (url: string, body: unknown, token: string | null = TOKEN): Promise<Response> =>
  fetch(`${url}/rig`, { method: 'POST', headers: token ? { [RIG_BRIDGE_TOKEN_HEADER]: token } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) })

afterEach(() => {
  server?.close()
  server = null
  vi.useRealTimers()
})

describe('servidor da ponte', () => {
  it('repassa { cmd, args } e devolve a resposta do painel', async () => {
    const url = await up(async (cmd, args) => ({ ok: true, result: { cmd, args } }))
    const res = await post(url, { cmd: 'nudgeGrip', args: { moveCm: [0.1, 0, 0] } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, result: { cmd: 'nudgeGrip', args: { moveCm: [0.1, 0, 0] } } })
  })

  it('recusa sem token, com token errado, fora da rota, sem cmd e corpo grande', async () => {
    const forward = vi.fn<RigForward>(async () => ({ ok: true }))
    const url = await up(forward)
    expect((await post(url, { cmd: 'state' }, null)).status).toBe(403)
    expect((await post(url, { cmd: 'state' }, 'xyz123')).status).toBe(403)
    expect((await fetch(`${url}/outra`, { method: 'POST', headers: { [RIG_BRIDGE_TOKEN_HEADER]: TOKEN } })).status).toBe(404)
    expect((await fetch(`${url}/rig`)).status).toBe(404)
    expect((await post(url, { args: {} })).status).toBe(400)
    expect((await post(url, '{ruim')).status).toBe(400)
    expect((await post(url, 'x'.repeat(MAX_BODY_BYTES + 1))).status).toBe(413)
    expect(forward).not.toHaveBeenCalled()
  })

  it('erro do repasse vira { ok: false, error }', async () => {
    const url = await up(async () => {
      throw new Error('quebrou')
    })
    expect(await (await post(url, { cmd: 'state' })).json()).toEqual({ ok: false, error: 'quebrou' })
  })
})

describe('repasse ao painel', () => {
  it('casa a resposta pelo id', async () => {
    const sent: RigCommand[] = []
    const fwd = createForward((m) => (sent.push(m), true))
    const a = fwd.forward('state', {})
    const b = fwd.forward('measure', {})
    fwd.reply(sent[1]!.id, { ok: true, result: 'b' })
    fwd.reply(sent[0]!.id, { ok: true, result: 'a' })
    fwd.reply(999, { ok: true }) // id desconhecido: ignorado
    expect(await a).toEqual({ ok: true, result: 'a' })
    expect(await b).toEqual({ ok: true, result: 'b' })
  })

  it('sem janela, sem resposta no prazo e resposta inválida', async () => {
    expect(await createForward(() => false).forward('state', {})).toEqual({ ok: false, error: 'Studio sem janela aberta' })
    vi.useFakeTimers()
    const late = createForward(() => true).forward('state', {})
    vi.advanceTimersByTime(REPLY_TIMEOUT_MS)
    expect((await late).error).toMatch(/não respondeu state em 15 s/)
    const sent: RigCommand[] = []
    const fwd = createForward((m) => (sent.push(m), true))
    const p = fwd.forward('state', {})
    fwd.reply(sent[0]!.id, null)
    expect(await p).toEqual({ ok: false, error: 'resposta inválida do painel' })
  })

  it('o gravar no GLB espera mais; o arquivo segue a variável', () => {
    expect(timeoutFor('save', { target: 'glb' })).toBe(SAVE_TIMEOUT_MS)
    expect(timeoutFor('save', { target: 'pose' })).toBe(REPLY_TIMEOUT_MS)
    expect(rigBridgeFile({ CORTEX_RIG_BRIDGE_FILE: 'X:/b.json' })).toBe('X:/b.json')
    expect(rigBridgeFile({})).toMatch(/\.cortex-studio[\\/]rig-bridge\.json$/)
  })
})

describe('fila do painel', () => {
  it('roda um comando por vez, na ordem, e a falha não trava os seguintes', async () => {
    const enqueue = serialQueue()
    const log: string[] = []
    let release: () => void = () => undefined
    const slow = enqueue(() => new Promise<string>((r) => (release = () => (log.push('save'), r('save')))))
    const bad = enqueue(async () => {
      log.push('bad')
      throw new Error('falhou')
    })
    const grip = enqueue(async () => (log.push('setGrip'), 'setGrip'))
    await Promise.resolve()
    expect(log).toEqual([])
    release()
    expect(await slow).toBe('save')
    await expect(bad).rejects.toThrow('falhou')
    expect(await grip).toBe('setGrip')
    expect(log).toEqual(['save', 'bad', 'setGrip'])
  })
})
