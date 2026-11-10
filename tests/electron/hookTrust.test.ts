/**
 * Confiança nos ganchos do auto-rig (SPEC-0724, adendo 1): impressão, confiança por projeto e texto do diálogo; e o
 * runner, que pergunta antes da `skin` e não roda nada se a resposta for não.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
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
  it('isHookTrusted confere a impressão da pasta do projeto, com \\ ou /', () => {
    const fp = hooksFingerprint(f.dir, abs)
    expect(isHookTrusted(undefined, f.dir, fp)).toBe(false)
    expect(isHookTrusted({ [trustKey(f.dir)]: fp }, f.dir.replace(/\//g, '\\'), fp)).toBe(true)
    expect(isHookTrusted({ [trustKey(f.dir)]: 'outra' }, f.dir, fp)).toBe(false)
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
