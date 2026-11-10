/**
 * Config do auto-rig do Studio (SPEC-0724): validação, caminhos e padrões.
 */
import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import {
  defaultMarkersPath,
  isBuiltinRigConfig,
  isProjectRelative,
  publishTarget,
  resolveRigConfig,
} from '../../electron/main/autoRig/autoRigConfig.js'

const PROJECT = resolve('/jogo')
const REL = 'tools/characters/npc-110.json'
const base = {
  code: 'npc-110',
  source: 'fontes/npc-110.glb',
  work: '.cortex/auto-rig/npc-110',
  skinned: { publish: { glb: 'assets/npc/npc-110-skinned.glb', clips: 'assets/npc/npc-110-skinned.json' } },
}
const run = (cfg: object) => resolveRigConfig(JSON.stringify(cfg), PROJECT, REL)

describe('isBuiltinRigConfig', () => {
  it('exige work e skinned.publish.{glb,clips}', () => {
    expect(isBuiltinRigConfig(base)).toBe(true)
    expect(isBuiltinRigConfig({ ...base, work: undefined })).toBe(false)
    expect(isBuiltinRigConfig({ ...base, skinned: { publish: { glb: 'a.glb' } } })).toBe(false)
    expect(isBuiltinRigConfig({ code: 'LUC-01', source: 'x.glb', skinned: {} })).toBe(false)
  })
})

describe('resolveRigConfig', () => {
  it('resolve os caminhos contra o projeto e preenche os padrões do LUC-01', () => {
    const r = run(base)
    if (!r.ok) throw new Error(r.errors.join())
    const c = r.config
    expect(c.source).toBe(join(PROJECT, 'fontes/npc-110.glb'))
    expect(c.work).toBe(join(PROJECT, '.cortex/auto-rig/npc-110'))
    expect(c.project).toBe(PROJECT)
    expect(c.transform).toEqual({ rotateZDeg: 0, height: 1.8, weld: 0.00001 })
    expect(c.skinned.markers).toBe(join(PROJECT, 'tools/characters/npc-110.markers.json'))
    expect(c.skinned.jointLimitsDeg).toEqual({ ForeArm: 115 })
    expect(c.skinned.jointBands['ElbowHelper']).toEqual({ band: 0.07, reach: 0.15, membership: 0.9 })
    expect(c.skinned).toMatchObject({ fbx: null, clips: {}, preview: [], hooks: [] })
    expect(c.budget).toBeUndefined()
  })

  it('mantém caminho absoluto e aceita barra invertida', () => {
    const abs = resolve('/assets/npc.glb')
    const r = run({ ...base, source: abs, skinned: { ...base.skinned, markers: 'tools\\characters\\m.json' } })
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.config.source).toBe(abs)
    expect(r.config.skinned.markers).toBe(join(PROJECT, 'tools/characters/m.json'))
  })

  it('lê transform, budget, hooks e as faixas parciais por cima do padrão', () => {
    const r = run({
      ...base,
      transform: { rotateZDeg: -90, height: 1.72, sharpAngleDeg: 60 },
      budget: { minTriangles: 1000, maxTriangles: 6000 },
      skinned: { ...base.skinned, hooks: ['tools/h.py'], jointBands: { KneeHelper: { band: 0.1, reach: 0.2, membership: 0.8 } } },
    })
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.config.transform).toEqual({ rotateZDeg: -90, height: 1.72, weld: 0.00001, sharpAngleDeg: 60 })
    expect(r.config.budget).toEqual({ minTriangles: 1000, maxTriangles: 6000 })
    expect(r.config.skinned.hooks).toEqual([join(PROJECT, 'tools/h.py')])
    expect(r.config.skinned.jointBands['KneeHelper']).toEqual({ band: 0.1, reach: 0.2, membership: 0.8 })
    expect(r.config.skinned.jointBands['ElbowHelper']).toBeDefined()
  })

  it('clipe com "file" exige skinned.fbx; preview só aponta para clipe com "file"', () => {
    const clips = { walk: { file: 'walking.fbx', loop: true }, carSit: { gta: 'CAR_sit' } }
    const bad = run({ ...base, skinned: { ...base.skinned, clips, preview: [{ label: 'x', clip: 'carSit' }] } })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.errors.some((e) => e.includes('skinned.fbx'))).toBe(true)
      expect(bad.errors.some((e) => e.includes('preview[0]'))).toBe(true)
    }
    const good = run({ ...base, skinned: { ...base.skinned, fbx: 'anim', clips, preview: [{ label: 'andar', clip: 'walk', mark: 'apex' }] } })
    if (!good.ok) throw new Error(good.errors.join())
    expect(good.config.skinned.fbx).toBe(join(PROJECT, 'anim'))
    expect(good.config.skinned.preview).toEqual([{ label: 'andar', clip: 'walk', mark: 'apex' }])
  })

  it('reprova code inválido, publish fora do projeto e números errados', () => {
    const r = run({
      ...base,
      code: 'npc 110',
      transform: { height: 0, weld: 'x' },
      skinned: { publish: { glb: '../fora.glb', clips: 'C:/abs.json' } },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toMatch(/code/)
    expect(r.errors.join('\n')).toMatch(/transform.height/)
    expect(r.errors.join('\n')).toMatch(/transform.weld/)
    expect(r.errors.join('\n')).toMatch(/publish.glb/)
    expect(r.errors.join('\n')).toMatch(/publish.clips/)
  })

  it('reprova work e hooks fora do projeto; source, fbx e markers podem estar fora (só leitura)', () => {
    for (const work of ['../fora', 'C:/fora', '/fora']) {
      const r = run({ ...base, work })
      expect(r.ok ? [] : r.errors).toContain('work tem de ser relativo ao projeto, sem ".."')
    }
    const hooks = run({ ...base, skinned: { ...base.skinned, hooks: ['tools/h.py', '../../x.py'] } })
    expect(hooks.ok ? [] : hooks.errors).toContain('skinned.hooks tem de ser relativo ao projeto, sem ".."')
    const reads = run({ ...base, source: 'D:/fontes/model.glb', skinned: { ...base.skinned, fbx: 'D:/anim', markers: 'D:/m.json' } })
    expect(reads.ok).toBe(true)
  })

  it('JSON inválido e config que não é do Studio', () => {
    const broken = resolveRigConfig('{', PROJECT, REL)
    expect(broken.ok).toBe(false)
    const notBuiltin = resolveRigConfig(JSON.stringify({ code: 'LUC-01', source: 'a.glb', skinned: {} }), PROJECT, REL)
    expect(notBuiltin.ok).toBe(false)
    if (!notBuiltin.ok) expect(notBuiltin.errors[0]).toMatch(/pipeline do Studio/)
  })

  it('ignora o BOM do começo do arquivo', () => {
    expect(resolveRigConfig('\uFEFF' + JSON.stringify(base), PROJECT, REL).ok).toBe(true)
  })
})

describe('caminhos do projeto', () => {
  it('isProjectRelative recusa absoluto, unidade e ".."', () => {
    expect(isProjectRelative('assets/a.glb')).toBe(true)
    expect(isProjectRelative('assets\\a.glb')).toBe(true)
    expect(isProjectRelative('../a.glb')).toBe(false)
    expect(isProjectRelative('assets/../../a.glb')).toBe(false)
    expect(isProjectRelative('/a.glb')).toBe(false)
    expect(isProjectRelative('D:/a.glb')).toBe(false)
  })

  it('defaultMarkersPath e publishTarget', () => {
    expect(defaultMarkersPath('tools/characters/npc-110.json')).toBe('tools/characters/npc-110.markers.json')
    const r = run(base)
    if (!r.ok) throw new Error(r.errors.join())
    expect(publishTarget(r.config, 'assets/a.glb')).toBe(join(PROJECT, 'assets/a.glb'))
    expect(() => publishTarget(r.config, '../a.glb')).toThrow(/fora do projeto/)
  })
})
