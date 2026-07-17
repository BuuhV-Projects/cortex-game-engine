/**
 * Testes do helper de espera determinística do playtest (`wait_for`):
 * polling até truthy, timeout com último valor, exceção do probe tratada
 * como falsy (a página pode ainda não ter o global) e relógio injetado.
 */
import { describe, it, expect, vi } from 'vitest'

// runAndCapture importa `electron` (BrowserWindow) no topo — mock vazio basta,
// o helper testado é puro sobre as dependências injetadas.
vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))

import { pollUntilTruthy } from '../../electron/agent/playtest/runAndCapture.js'

/** Relógio fake: `now()` avança só quando o sleep injetado "dorme". */
function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: (ms: number): Promise<void> => {
      t += ms
      return Promise.resolve()
    },
  }
}

describe('pollUntilTruthy', () => {
  it('resolve ok=true assim que o probe vira truthy', async () => {
    const clock = fakeClock()
    let calls = 0
    const probe = (): Promise<unknown> => Promise.resolve(++calls >= 3 ? 'pronto' : false)

    const r = await pollUntilTruthy(probe, 60000, 500, clock.sleep, clock.now)

    expect(r.ok).toBe(true)
    expect(r.lastValue).toBe('pronto')
    expect(calls).toBe(3)
    expect(r.elapsedMs).toBe(1000) // dormiu 2× 500ms antes do 3º probe
  })

  it('não dorme quando o probe já é truthy de primeira', async () => {
    const clock = fakeClock()
    const sleep = vi.fn(clock.sleep)
    const r = await pollUntilTruthy(() => Promise.resolve(true), 60000, 500, sleep, clock.now)
    expect(r.ok).toBe(true)
    expect(r.elapsedMs).toBe(0)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('estoura o timeout com ok=false e devolve o último valor visto', async () => {
    const clock = fakeClock()
    const r = await pollUntilTruthy(
      () => Promise.resolve('carregando'.length === 99), // sempre false
      2000,
      500,
      clock.sleep,
      clock.now,
    )
    expect(r.ok).toBe(false)
    expect(r.lastValue).toBe(false)
    expect(r.elapsedMs).toBeGreaterThanOrEqual(2000)
  })

  it('trata exceção do probe como falsy e registra a mensagem', async () => {
    const clock = fakeClock()
    const r = await pollUntilTruthy(
      () => Promise.reject(new Error('__bootStage is not defined')),
      1000,
      500,
      clock.sleep,
      clock.now,
    )
    expect(r.ok).toBe(false)
    expect(String(r.lastValue)).toContain('__bootStage is not defined')
  })

  it('probe que lança primeiro e vira truthy depois ainda resolve ok', async () => {
    const clock = fakeClock()
    let calls = 0
    const probe = (): Promise<unknown> => {
      calls++
      return calls < 2 ? Promise.reject(new Error('ainda não')) : Promise.resolve(1)
    }
    const r = await pollUntilTruthy(probe, 60000, 500, clock.sleep, clock.now)
    expect(r.ok).toBe(true)
    expect(r.lastValue).toBe(1)
  })
})
