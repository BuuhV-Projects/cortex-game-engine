/**
 * Aprovar, Desfazer e registro de rigs do auto-rig do Studio (SPEC-0724).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { approve, clipDurations, detectIndent, registerRig, revert, safeCopy } from '../../electron/main/autoRig/autoRigPublish.js'
import type { RigState } from '../../electron/main/autoRig/autoRigState.js'
import { CONFIG_REL, makeRigFixture, writeStaging, type RigFixture } from './autoRigFixture.mjs'

let f: RigFixture
beforeEach(() => {
  f = makeRigFixture()
  writeStaging(f)
})
afterEach(() => f.cleanup())

const HASHES = { skin: 's1', preview: 'p1' }
const NOW = new Date('2026-11-10T12:00:00.000Z')
const passed = (): RigState => ({
  stages: Object.fromEntries(Object.entries(HASHES).map(([k, hash]) => [k, { hash, status: 'pass', seconds: 1, at: NOW.toISOString(), failures: [], infra: null }])),
})
const glbOut = (): string => join(f.dir, 'assets/npc/npc-110-skinned.glb')
const registry = (): { rigs: Record<string, Record<string, unknown>> } => JSON.parse(readFileSync(join(f.dir, 'tools/characters/rigs.json'), 'utf8'))

describe('approve', () => {
  it('não publica com etapa pendente ou reprovada', () => {
    const out = approve(f.config, CONFIG_REL, { stages: {} }, HASHES, NOW)
    expect(out.code).toBe(1)
    expect(out.lines[0]).toMatch(/skin, preview/)
    expect(existsSync(glbOut())).toBe(false)
  })

  it('publica o staging, grava o backup e o published do registro', () => {
    mkdirSync(join(f.dir, 'assets/npc'), { recursive: true })
    writeFileSync(glbOut(), 'antigo')
    const st = passed()
    const out = approve(f.config, CONFIG_REL, st, HASHES, NOW)
    expect(out.code).toBe(0)
    expect(readFileSync(glbOut(), 'utf8')).toBe('novo')
    expect(st.published?.at).toBe(NOW.toISOString())
    const backup = st.published!.backup
    expect(readFileSync(join(backup, 'npc-110-skinned.glb'), 'utf8')).toBe('antigo')
    const manifest = JSON.parse(readFileSync(join(backup, 'manifest.json'), 'utf8')) as Array<{ backup: string | null }>
    expect(manifest.map((m) => m.backup === null)).toEqual([false, true]) // o JSON não existia antes
    const entry = registry().rigs['npc-110']!
    expect(entry['published']).toEqual({ glb: 'assets/npc/npc-110-skinned.glb', clips: 'assets/npc/npc-110-skinned.json', at: NOW.toISOString() })
    expect(entry['config']).toBe(CONFIG_REL)
  })

  it('falha na segunda cópia: volta o que já tinha copiado, sem backup órfão (2)', () => {
    mkdirSync(join(f.dir, 'assets/npc'), { recursive: true })
    writeFileSync(glbOut(), 'antigo')
    rmSync(join(f.config.work, 'staging/npc-110-skinned.json'))
    const st = passed()
    const out = approve(f.config, CONFIG_REL, st, HASHES, NOW)
    expect(out.code).toBe(2)
    expect(out.lines[0]).toMatch(/não publicado/)
    expect(readFileSync(glbOut(), 'utf8')).toBe('antigo')
    expect(existsSync(join(f.dir, 'assets/npc/npc-110-skinned.json'))).toBe(false)
    expect(st.published).toBeUndefined()
    expect(readdirSync(join(f.config.work, 'backup'))).toEqual([])
  })

  it('falha no backup: código 2, projeto intocado, sem backup órfão', () => {
    mkdirSync(join(f.dir, 'assets/npc/npc-110-skinned.json'), { recursive: true }) // o backup de uma pasta falha
    writeFileSync(glbOut(), 'antigo')
    const out = approve(f.config, CONFIG_REL, passed(), HASHES, NOW)
    expect(out.code).toBe(2)
    expect(readFileSync(glbOut(), 'utf8')).toBe('antigo')
    expect(readdirSync(join(f.config.work, 'backup'))).toEqual([])
  })
})

describe('revert', () => {
  it('sem publicação: código 1', () => {
    expect(revert(f.config, CONFIG_REL, { stages: {} }).code).toBe(1)
  })

  it('restaura o que existia, apaga o que não existia e tira o published do registro', () => {
    mkdirSync(join(f.dir, 'assets/npc'), { recursive: true })
    writeFileSync(glbOut(), 'antigo')
    const st = passed()
    approve(f.config, CONFIG_REL, st, HASHES, NOW)
    const out = revert(f.config, CONFIG_REL, st)
    expect(out.code).toBe(0)
    expect(readFileSync(glbOut(), 'utf8')).toBe('antigo')
    expect(existsSync(join(f.dir, 'assets/npc/npc-110-skinned.json'))).toBe(false)
    expect(st.published).toBeUndefined()
    expect(registry().rigs['npc-110']!['published']).toBeUndefined()
    expect(readdirSync(join(f.config.work, 'backup'))).toEqual([]) // o próximo Desfazer vai à publicação anterior
  })
})

describe('registerRig', () => {
  it('staging: caminhos relativos ao projeto, clipes com "file" e a duração do JSON do skin', () => {
    const fbx = join(f.dir, 'anim')
    const cfg = { ...f.config, skinned: { ...f.config.skinned, fbx, clips: { walk: { file: 'walk.fbx', loop: true }, carSit: { gta: 'CAR_sit' } } } }
    registerRig(cfg, CONFIG_REL, 'staging', { at: 'T' }, { walk: 1.5 })
    const entry = registry().rigs['npc-110']!
    expect(entry['staging']).toEqual({ glb: '.work/npc-110/staging/npc-110-skinned.glb', clips: '.work/npc-110/staging/npc-110-skinned.json', at: 'T' })
    expect(entry['animations']).toBe('anim')
    expect(entry['clips']).toEqual([{ name: 'walk', file: 'walk.fbx', loop: true, duration: 1.5 }])
  })

  it('mantém os outros personagens e a indentação de 1 espaço do arquivo', () => {
    const path = join(f.dir, 'tools/characters/rigs.json')
    writeFileSync(path, JSON.stringify({ version: 1, rigs: { 'LUC-01': { config: 'x' } } }, null, 1))
    registerRig(f.config, CONFIG_REL, 'staging', { at: 'T' }, {})
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/\n "rigs"/)
    expect(registry().rigs['LUC-01']).toEqual({ config: 'x' })
    expect(registry().rigs['npc-110']!['animations']).toBe('assets/npc')
  })

  it('registro ilegível: devolve o aviso e não sobrescreve o arquivo', () => {
    const path = join(f.dir, 'tools/characters/rigs.json')
    writeFileSync(path, '{ "rigs": ')
    expect(registerRig(f.config, CONFIG_REL, 'staging', { at: 'T' }, {})).toMatch(/ilegível/)
    expect(readFileSync(path, 'utf8')).toBe('{ "rigs": ')
    writeFileSync(path, 'null')
    expect(registerRig(f.config, CONFIG_REL, 'staging', { at: 'T' }, {})).toMatch(/ilegível/)
  })
})

describe('utilitários', () => {
  it('detectIndent, clipDurations e safeCopy', () => {
    expect(detectIndent('{\n "a": 1\n}')).toBe(1)
    expect(detectIndent('{\n    "a": 1\n}')).toBe(4)
    expect(detectIndent('{}')).toBe(2)
    expect(clipDurations(join(f.config.work, 'staging/npc-110-skinned.json'))).toEqual({ walk: 1.5 })
    expect(clipDurations(join(f.dir, 'nada.json'))).toEqual({})
    const to = join(f.dir, 'copia.glb')
    safeCopy(join(f.config.work, 'staging/npc-110-skinned.glb'), to)
    expect(readFileSync(to, 'utf8')).toBe('novo')
    expect(readdirSync(f.dir).some((n) => n.includes('.tmp-'))).toBe(false)
  })
})
