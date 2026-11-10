/**
 * Orquestração do auto-rig do Studio (SPEC-0724): códigos de saída e o que vai para o painel.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { relevantLines, runAutoRig, trackChild, type AutoRigRunOptions } from '../../electron/main/autoRig/autoRigRunner.js'
import { readState, stageHashes, writeState } from '../../electron/main/autoRig/autoRigState.js'
import { CONFIG_REL, makeRigFixture, writeStaging, type RigFixture } from './autoRigFixture.mjs'

let f: RigFixture
let out = ''
beforeEach(() => {
  f = makeRigFixture()
  out = ''
})
afterEach(() => f.cleanup())

const opts = (over: Partial<AutoRigRunOptions> = {}): AutoRigRunOptions => ({
  projectDir: f.dir,
  configRel: CONFIG_REL,
  action: 'generate',
  blender: null,
  scriptsDir: f.scriptsDir,
  send: (t) => {
    out += t
  },
  onChild: () => {},
  now: () => new Date('2026-11-10T12:00:00.000Z'),
  ...over,
})

describe('relevantLines', () => {
  it('passa só as linhas [autorig] e guarda a linha incompleta', () => {
    expect(relevantLines('Blender 5.1\n[autorig] corpo: 10\nRead blend\n[autorig] me')).toEqual({ lines: ['[autorig] corpo: 10'], rest: '[autorig] me' })
    expect(relevantLines('[autorig] a\r\n')).toEqual({ lines: ['[autorig] a'], rest: '' })
  })
})

describe('trackChild', () => {
  it('o close atrasado do Blender morto não esquece o Blender da execução nova', () => {
    const [velho, novo] = [{ id: 1 }, { id: 2 }]
    let atual = trackChild(null, velho, true)
    atual = trackChild(atual, novo, true) // nova execução matou o velho e começou o novo
    atual = trackChild(atual, velho, false) // close do velho chega depois
    expect(atual).toBe(novo) // o Parar ainda mata o novo
    expect(trackChild(atual, novo, false)).toBeNull()
  })
})

describe('runAutoRig', () => {
  it('config inválida ou ausente: 64 com os problemas', async () => {
    writeFileSync(join(f.dir, CONFIG_REL), JSON.stringify({ code: 'x y', work: 'w', source: 's', skinned: { publish: { glb: '../a', clips: 'b' } } }))
    expect(await runAutoRig(opts())).toBe(64)
    expect(out).toMatch(/config inválida/)
    expect(await runAutoRig(opts({ configRel: 'tools/characters/nada.json' }))).toBe(64)
  })

  it('sem Blender: 2, explica o botão e não grava estado', async () => {
    expect(await runAutoRig(opts())).toBe(2)
    expect(out).toMatch(/Blender…/)
    expect(readState(f.config.work)).toEqual({ stages: {} })
    expect(existsSync(join(f.config.work, 'config.resolved.json'))).toBe(true)
  })

  it('Blender que não roda: 2, etapa skin como infraestrutura, nada publicado', async () => {
    const code = await runAutoRig(opts({ blender: join(f.dir, 'nao-existe', 'blender.exe') }))
    expect(code).toBe(2)
    expect(readState(f.config.work).stages.skin?.status).toBe('infra')
    expect(out).toMatch(/nada foi publicado/)
  })

  it('etapas já aprovadas com as entradas de agora: reaproveita e pede revisão (3)', async () => {
    await runAutoRig(opts()) // grava a config resolvida e as pastas
    const hashes = stageHashes(f.config, f.scriptsDir)
    const st = (hash: string) => ({ hash, status: 'pass' as const, seconds: 1, at: 'T', failures: [], infra: null })
    writeState(f.config.work, { stages: { skin: st(hashes.skin), preview: st(hashes.preview) } })
    out = ''
    expect(await runAutoRig(opts({ blender: 'blender' }))).toBe(3)
    expect(out).toMatch(/skin: reaproveitada/)
    expect(out).toMatch(/REVISÃO VISUAL/)
  })

  it('Aprovar com as etapas em dia publica (0); Desfazer volta (0)', async () => {
    await runAutoRig(opts())
    writeStaging(f)
    const hashes = stageHashes(f.config, f.scriptsDir)
    const st = (hash: string) => ({ hash, status: 'pass' as const, seconds: 1, at: 'T', failures: [], infra: null })
    writeState(f.config.work, { stages: { skin: st(hashes.skin), preview: st(hashes.preview) } })
    expect(await runAutoRig(opts({ action: 'approve' }))).toBe(0)
    expect(readFileSync(join(f.dir, 'assets/npc/npc-110-skinned.glb'), 'utf8')).toBe('novo')
    expect(await runAutoRig(opts({ action: 'revert' }))).toBe(0)
    expect(existsSync(join(f.dir, 'assets/npc/npc-110-skinned.glb'))).toBe(false)
  })

  it('cancelada durante a skin: não grava o estado nem abre a preview (2)', async () => {
    const abort = new AbortController()
    let started = 0
    const onChild = (_c: unknown, active: boolean): void => {
      if (active && ++started === 1) abort.abort() // uma execução nova (ou o Parar) chegou
    }
    const code = await runAutoRig(opts({ blender: process.execPath, signal: abort.signal, onChild }))
    expect(code).toBe(2)
    expect(started).toBe(1)
    expect(readState(f.config.work).stages.skin).toBeUndefined()
    expect(out).toMatch(/cancelado/)
  })

  it('Aprovar sem gerar: 1', async () => {
    expect(await runAutoRig(opts({ action: 'approve' }))).toBe(1)
    expect(out).toMatch(/não publicado/)
  })
})
