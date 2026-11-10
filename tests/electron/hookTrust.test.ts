/**
 * Confiança nos ganchos do auto-rig (SPEC-0724, adendo 1): impressão, confiança por projeto e texto do diálogo; e o
 * runner, que pergunta antes da `skin` e não roda nada se a resposta for não.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hookDialogText, hooksFingerprint, isHookTrusted, trustKey } from '../../electron/main/autoRig/hookTrust.js'
import { runAutoRig } from '../../electron/main/autoRig/autoRigRunner.js'
import { readState, stageHashes, writeState } from '../../electron/main/autoRig/autoRigState.js'
import { CONFIG_REL, FIXTURE_CONFIG, makeRigFixture, type RigFixture } from './autoRigFixture.mjs'

const HOOKS = ['tools/rig-hooks/a.py', 'tools/rig-hooks/b.py']

let f: RigFixture
let abs: string[]
beforeEach(() => {
  f = makeRigFixture({ ...FIXTURE_CONFIG, skinned: { ...FIXTURE_CONFIG.skinned, hooks: HOOKS } })
  mkdirSync(join(f.dir, 'tools/rig-hooks'), { recursive: true })
  abs = HOOKS.map((h) => join(f.dir, h))
  abs.forEach((p, i) => writeFileSync(p, `# gancho ${i}`))
})
afterEach(() => f.cleanup())

describe('hooksFingerprint', () => {
  it('é estável e muda com o conteúdo, a ordem e a lista', () => {
    const fp = hooksFingerprint(f.dir, abs)
    expect(hooksFingerprint(f.dir, abs)).toBe(fp)
    expect(hooksFingerprint(f.dir, [...abs].reverse())).not.toBe(fp)
    expect(hooksFingerprint(f.dir, abs.slice(0, 1))).not.toBe(fp)
    writeFileSync(abs[1]!, '# mudou')
    expect(hooksFingerprint(f.dir, abs)).not.toBe(fp)
  })
})

describe('confiança e diálogo', () => {
  it('isHookTrusted confere a impressão do projeto; no Windows a chave ignora maiúsculas', () => {
    const fp = hooksFingerprint(f.dir, abs)
    expect(isHookTrusted(undefined, f.dir, fp)).toBe(false)
    expect(isHookTrusted({ [trustKey(f.dir)]: fp }, join(f.dir, '.'), fp)).toBe(true)
    expect(isHookTrusted({ [trustKey(f.dir)]: 'outra' }, f.dir, fp)).toBe(false)
    expect(trustKey('C:/Jogos/Port', 'win32')).toBe(trustKey('c:/jogos/port', 'win32'))
    expect(trustKey('/jogos/Port', 'linux')).not.toBe(trustKey('/jogos/port', 'linux'))
  })

  it('o diálogo lista os ganchos relativos ao projeto, em pt por padrão e em en', () => {
    const pt = hookDialogText(undefined, f.dir, abs)
    expect(pt.buttons).toEqual(['Rodar os ganchos', 'Cancelar'])
    expect(pt.detail).toContain('tools/rig-hooks/a.py')
    expect(pt.detail).not.toContain(f.dir)
    expect(hookDialogText('en', f.dir, abs).buttons).toEqual(['Run the hooks', 'Cancel'])
  })
})

describe('runner', () => {
  it('recusa: não roda a skin nem grava o estado (2); pergunta com os ganchos da config', async () => {
    let asked: string[] = []
    let started = 0
    let out = ''
    const code = await runAutoRig({
      projectDir: f.dir,
      configRel: CONFIG_REL,
      action: 'generate',
      blender: process.execPath,
      scriptsDir: f.scriptsDir,
      send: (t) => (out += t),
      onChild: () => started++,
      confirmHooks: async (hooks) => {
        asked = hooks
        return false
      },
    })
    expect(code).toBe(2)
    expect(asked).toEqual(abs)
    expect(started).toBe(0)
    expect(readState(f.config.work).stages.skin).toBeUndefined()
    expect(out).toMatch(/ganchos não autorizados/)
  })

  it('sem quem pergunte, os ganchos não rodam (2)', async () => {
    let out = ''
    const base = { projectDir: f.dir, configRel: CONFIG_REL, action: 'generate' as const, scriptsDir: f.scriptsDir, onChild: () => {} }
    expect(await runAutoRig({ ...base, blender: process.execPath, send: (t) => (out += t) })).toBe(2)
    expect(out).toMatch(/ganchos sem confirmação/)
  })

  it('aceito: roda a cópia confirmada, não o arquivo trocado durante a pergunta', async () => {
    let copies: string[] = []
    await runAutoRig({
      projectDir: f.dir,
      configRel: CONFIG_REL,
      action: 'generate',
      blender: process.execPath,
      scriptsDir: f.scriptsDir,
      send: () => {},
      onChild: () => {},
      confirmHooks: async (_hooks, c) => {
        copies = c
        writeFileSync(abs[0]!, '# trocado depois de confirmar')
        return true
      },
    })
    const resolved = JSON.parse(readFileSync(join(f.config.work, 'config.resolved.json'), 'utf8')) as { skinned: { hooks: string[] } }
    expect(resolved.skinned.hooks).toEqual(copies)
    expect(copies.every((c) => c.startsWith(join(f.config.work, 'hooks')))).toBe(true)
    expect(readFileSync(copies[0]!, 'utf8')).toBe('# gancho 0')
    expect(hooksFingerprint(f.dir, abs, copies)).not.toBe(hooksFingerprint(f.dir, abs)) // a confiança vale para a cópia
  })

  it('skin reaproveitada não roda gancho e não pergunta', async () => {
    mkdirSync(f.config.work, { recursive: true })
    const hashes = stageHashes(f.config, f.scriptsDir)
    const st = (hash: string) => ({ hash, status: 'pass' as const, seconds: 1, at: 'T', failures: [], infra: null })
    writeState(f.config.work, { stages: { skin: st(hashes.skin), preview: st(hashes.preview) } })
    let asked = false
    const code = await runAutoRig({
      projectDir: f.dir,
      configRel: CONFIG_REL,
      action: 'generate',
      blender: 'blender',
      scriptsDir: f.scriptsDir,
      send: () => {},
      onChild: () => {},
      confirmHooks: async () => (asked = true),
    })
    expect(code).toBe(3)
    expect(asked).toBe(false)
  })
})
