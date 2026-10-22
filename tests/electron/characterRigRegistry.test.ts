/**
 * Registro de rigs (`tools/characters/rigs.json`) da aba Animações do painel
 * auto-rig (SPEC-0349, adendo 1).
 */

import { describe, it, expect } from 'vitest'
import {
  availableBuilds,
  clipNameFromFile,
  formatSeconds,
  isAbsolutePath,
  parseRigRegistry,
  pickBuild,
  registryPath,
  resolveProjectPath,
  splitPath,
  type RigEntry,
} from '../../electron/renderer/characterRigRegistry.js'
import { isCharacterConfigName } from '../../electron/renderer/characterRig.js'

const REAL = {
  version: 1,
  rigs: {
    'LUC-01': {
      config: 'tools/characters/LUC-01.json',
      animations: 'animations/characters/basic-locomotion',
      staging: {
        glb: 'D:/Codex/assets/personagens/lucas-rocha/integracao/staging/LUC-01-skinned.glb',
        clips: 'D:/Codex/assets/personagens/lucas-rocha/integracao/staging/LUC-01-skinned.json',
        at: '2026-10-19T10:51:58.835Z',
      },
      clips: [
        { name: 'walk', file: 'walking.fbx', loop: true, duration: 1.0333 },
        { name: 'jump', file: 'jump.fbx', loop: false, duration: 2.1667 },
        { name: 'turnLeft90', file: 'left turn 90.fbx', loop: false, duration: 0.9333 },
      ],
    },
  },
}

describe('parseRigRegistry', () => {
  it('lê o formato real (só staging, BOM)', () => {
    const r = parseRigRegistry(`\uFEFF${JSON.stringify(REAL)}`)
    const e = r.rigs['LUC-01']!
    expect(e.published).toBeUndefined()
    expect(e.clips.map((c) => c.name)).toEqual(['walk', 'jump', 'turnLeft90'])
    expect(e.clips[1]!.loop).toBe(false)
  })

  it('recusa versão, build sem glb e data inválida', () => {
    expect(() => parseRigRegistry('{"version":2,"rigs":{}}')).toThrow(/versão/)
    const noGlb = structuredClone(REAL) as Record<string, any>
    delete noGlb.rigs['LUC-01'].staging.glb
    expect(() => parseRigRegistry(JSON.stringify(noGlb))).toThrow(/staging\.glb/)
    const badAt = structuredClone(REAL) as Record<string, any>
    badAt.rigs['LUC-01'].staging.at = 'ontem'
    expect(() => parseRigRegistry(JSON.stringify(badAt))).toThrow(/at inválido/)
  })
})

describe('escolha do build', () => {
  const base = parseRigRegistry(JSON.stringify(REAL)).rigs['LUC-01']!
  const both: RigEntry = { ...base, published: { glb: 'assets/p/LUC-01-skinned.glb', clips: 'assets/p/LUC-01-skinned.json', at: '2026-10-19T12:00:00Z' } }

  it('o mais recente pelo `at`, com preferência quando existe', () => {
    expect(pickBuild(base)?.kind).toBe('staging')
    expect(availableBuilds(both)).toEqual(['published', 'staging'])
    expect(pickBuild(both)?.kind).toBe('published')
    expect(pickBuild(both, 'staging')?.kind).toBe('staging')
    expect(pickBuild(base, 'published')?.kind).toBe('staging')
    expect(pickBuild({ ...base, staging: undefined })).toBeNull()
  })
})

describe('caminhos', () => {
  it('relativo é do projeto; absoluto passa direto', () => {
    expect(isAbsolutePath('D:/a/b.glb')).toBe(true)
    expect(isAbsolutePath('D:\\a\\b.glb')).toBe(true)
    expect(isAbsolutePath('assets/p.glb')).toBe(false)
    expect(resolveProjectPath('D:/jogo/', 'assets/p.glb')).toBe('D:/jogo/assets/p.glb')
    expect(resolveProjectPath('D:/jogo', './assets/p.glb')).toBe('D:/jogo/assets/p.glb')
    expect(resolveProjectPath('D:/jogo', 'E:/x.glb')).toBe('E:/x.glb')
    expect(registryPath('D:\\jogo\\')).toBe('D:\\jogo/tools/characters/rigs.json')
  })

  it('rigs.json não é config de personagem', () => {
    expect(isCharacterConfigName('rigs.json')).toBe(false)
  })
})

describe('nomes e arquivos', () => {
  it('nome camelCase do arquivo', () => {
    expect(clipNameFromFile('left turn 90.fbx')).toBe('leftTurn90')
    expect(clipNameFromFile('Right Strafe Walking.fbx')).toBe('rightStrafeWalking')
    expect(clipNameFromFile('run_fast-loop.FBX')).toBe('runFastLoop')
    expect(clipNameFromFile('D:/anim/jump.fbx')).toBe('jump')
    expect(formatSeconds(1.0333)).toBe('1.03 s')
  })

  it('splitPath separa pasta e nome', () => {
    expect(splitPath('D:/a/b/LUC.glb')).toEqual({ dir: 'D:/a/b', name: 'LUC.glb' })
    expect(splitPath('D:\\a\\LUC.glb')).toEqual({ dir: 'D:\\a', name: 'LUC.glb' })
    expect(splitPath('/LUC.glb')).toEqual({ dir: '/', name: 'LUC.glb' })
    expect(splitPath('LUC.glb')).toEqual({ dir: '.', name: 'LUC.glb' })
  })
})
