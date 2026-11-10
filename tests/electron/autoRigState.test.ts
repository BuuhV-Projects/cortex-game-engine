/**
 * Hash das entradas e estado das etapas do auto-rig do Studio (SPEC-0724).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileSha, isFresh, readState, stageHashes, stagesToRun, writeState, type RigState } from '../../electron/main/autoRig/autoRigState.js'
import { makeRigFixture, type RigFixture } from './autoRigFixture.mjs'

let f: RigFixture
beforeEach(() => {
  f = makeRigFixture()
})
afterEach(() => f.cleanup())

const pass = (hash: string): RigState['stages']['skin'] => ({ hash, status: 'pass', seconds: 1, at: '2026-11-10T00:00:00.000Z', failures: [], infra: null })

describe('stageHashes', () => {
  it('é estável e muda com a fonte, os marcadores e os scripts', () => {
    const a = stageHashes(f.config, f.scriptsDir)
    expect(stageHashes(f.config, f.scriptsDir)).toEqual(a)
    writeFileSync(f.config.skinned.markers, '{"x":1}')
    const b = stageHashes(f.config, f.scriptsDir)
    expect(b.skin).not.toBe(a.skin)
    expect(b.preview).not.toBe(a.preview) // a prévia depende da skin
    writeFileSync(join(f.scriptsDir, 'autorig_skeleton.py'), '# novo')
    expect(stageHashes(f.config, f.scriptsDir).skin).not.toBe(b.skin)
  })

  it('mudar só as poses da folha refaz só a prévia', () => {
    const a = stageHashes(f.config, f.scriptsDir)
    const withPose = { ...f.config, skinned: { ...f.config.skinned, preview: [{ label: 'repouso 2' }] } }
    const b = stageHashes(withPose, f.scriptsDir)
    expect(b.skin).toBe(a.skin)
    expect(b.preview).not.toBe(a.preview)
  })

  it('o FBX de cada clipe com "file" entra no hash; o destino da publicação não', () => {
    const fbx = join(f.dir, 'anim')
    mkdirSync(fbx)
    writeFileSync(join(fbx, 'walk.fbx'), 'a')
    const cfg = { ...f.config, skinned: { ...f.config.skinned, fbx, clips: { walk: { file: 'walk.fbx' } } } }
    const a = stageHashes(cfg, f.scriptsDir)
    writeFileSync(join(fbx, 'walk.fbx'), 'b')
    expect(stageHashes(cfg, f.scriptsDir).skin).not.toBe(a.skin)
    const moved = { ...cfg, skinned: { ...cfg.skinned, publish: { glb: 'outro.glb', clips: 'outro.json' } } }
    expect(stageHashes(moved, f.scriptsDir).skin).toBe(stageHashes(cfg, f.scriptsDir).skin)
  })
})

describe('estado', () => {
  it('fileSha de arquivo ausente é "missing"', () => {
    expect(fileSha(join(f.dir, 'nada'))).toBe('missing')
  })

  it('readState sem arquivo ou ilegível começa vazio; writeState relê igual', () => {
    mkdirSync(f.config.work, { recursive: true })
    expect(readState(f.config.work)).toEqual({ stages: {} })
    writeFileSync(join(f.config.work, 'state.json'), '{')
    expect(readState(f.config.work)).toEqual({ stages: {} })
    const st: RigState = { stages: { skin: pass('abc') } }
    writeState(f.config.work, st)
    expect(readState(f.config.work)).toEqual(st)
  })

  it('stagesToRun: o que mudou ou não passou, na ordem', () => {
    const h = { skin: 's1', preview: 'p1' }
    expect(stagesToRun({ stages: {} }, h)).toEqual(['skin', 'preview'])
    const fresh: RigState = { stages: { skin: pass('s1'), preview: pass('p1') } }
    expect(stagesToRun(fresh, h)).toEqual([])
    expect(stagesToRun(fresh, { skin: 's1', preview: 'p2' })).toEqual(['preview'])
    const failed: RigState = { stages: { skin: { ...pass('s1')!, status: 'fail' }, preview: pass('p1') } }
    expect(stagesToRun(failed, h)).toEqual(['skin'])
    expect(isFresh(failed, h, 'preview')).toBe(true)
  })
})
