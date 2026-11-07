/**
 * Arma na mão no ajuste de pose (SPEC-0703): chave `clipe@ARMA`, variantes e
 * pegadas na config do rig, e a lista de armas a partir dos nós do GLB.
 */

import { describe, it, expect } from 'vitest'
import { parseConfigObject, serializeConfig, type JsonObject } from '../../electron/renderer/characterRigSelection.js'
import type { Quat } from '../../electron/renderer/characterRigArmSpace.js'
import {
  DEFAULT_GRIP,
  DEFAULT_WEAPONS_GLB,
  applyGrips,
  applyVariants,
  gripsFromConfig,
  splitVariant,
  variantFollowsFromConfig,
  variantKey,
  variantPosesFromConfig,
  weaponsFromNodes,
  weaponsGlbOf,
} from '../../electron/renderer/characterRigWeapon.js'

const TURN: Quat = [0, 0.7071068, 0, 0.7071068]
const LINK = { bone: 'LeftHand', target: 'RightHand', offset: [0.1, 0, 0.2] as [number, number, number], rotation: [0, 0, 0, 1] as Quat }

function config(): JsonObject {
  return parseConfigObject(JSON.stringify({
    code: 'LUC-01',
    skinned: {
      clips: {
        idle: { file: 'idle.fbx', loop: true, pose: { Head: TURN } },
        walk: { file: 'walk.fbx', weapons: { 'ARM-02': { pose: { Spine: TURN }, follow: [LINK] } } },
      },
    },
  }))
}

const clipsOf = (cfg: JsonObject): Record<string, Record<string, unknown>> =>
  (cfg['skinned'] as Record<string, Record<string, Record<string, unknown>>>)['clips']!

describe('chave clipe@ARMA', () => {
  it('monta e separa no último @', () => {
    expect(variantKey('idle', null)).toBe('idle')
    expect(variantKey('idle', 'ARM-02')).toBe('idle@ARM-02')
    expect(splitVariant('idle@ARM-02')).toEqual({ clip: 'idle', weapon: 'ARM-02' })
    expect(splitVariant('idle')).toEqual({ clip: 'idle', weapon: null })
  })

  it('@ na ponta não é arma', () => {
    expect(splitVariant('@ARM-02')).toEqual({ clip: '@ARM-02', weapon: null })
    expect(splitVariant('idle@')).toEqual({ clip: 'idle@', weapon: null })
  })
})

describe('variantes na config', () => {
  it('lê pose e ligações das variantes salvas', () => {
    const cfg = config()
    const poses = variantPosesFromConfig(cfg)
    expect([...poses.keys()]).toEqual(['walk@ARM-02'])
    expect(poses.get('walk@ARM-02')!.has('Spine')).toBe(true)
    expect(variantFollowsFromConfig(cfg).get('walk@ARM-02')).toHaveLength(1)
  })

  it('grava variante nova no fim da entrada, resto igual', () => {
    const next = applyVariants(config(), new Map([['idle@ESC-01', new Map([['LeftArm', TURN]])]]), new Map())
    const idle = clipsOf(next)['idle']!
    expect(Object.keys(idle)).toEqual(['file', 'loop', 'pose', 'weapons'])
    expect((idle['weapons'] as JsonObject)['ESC-01']).toEqual({ pose: { LeftArm: [0, 0.707107, 0, 0.707107] } })
    expect(clipsOf(next)['walk']).toEqual(clipsOf(config())['walk'])
  })

  it('pose e ligações vazias ficam gravadas (sobrepõem o clipe base)', () => {
    const next = applyVariants(config(), new Map([['walk@ARM-02', new Map()]]), new Map([['walk@ARM-02', []]]))
    expect((clipsOf(next)['walk']!['weapons'] as Record<string, JsonObject>)['ARM-02']).toEqual({ pose: {}, follow: [] })
    expect(variantPosesFromConfig(next).get('walk@ARM-02')!.size).toBe(0)
    expect(variantFollowsFromConfig(next).get('walk@ARM-02')).toEqual([])
  })

  it('sem o campo, a variante não entra (herda o clipe base)', () => {
    const cfg = applyVariants(config(), new Map([['idle@ESC-01', new Map([['Head', TURN]])]]), new Map())
    expect(variantPosesFromConfig(cfg).has('idle@ESC-01')).toBe(true)
    expect(variantFollowsFromConfig(cfg).has('idle@ESC-01')).toBe(false)
  })

  it('ignora clipe fora da config e chave sem arma', () => {
    const cfg = config()
    const next = applyVariants(cfg, new Map([['run@ARM-02', new Map([['Head', TURN]])], ['idle', new Map()]]), new Map())
    expect(serializeConfig(next)).toBe(serializeConfig(cfg))
  })

  it('grava ligações da variante com 6 casas', () => {
    const link = { ...LINK, offset: [0.12345678, 0, 0] as [number, number, number] }
    const next = applyVariants(config(), new Map(), new Map([['idle@ARM-02', [link]]]))
    const w = (clipsOf(next)['idle']!['weapons'] as Record<string, JsonObject>)['ARM-02']!
    expect((w['follow'] as JsonObject[])[0]!['offset']).toEqual([0.123457, 0, 0])
  })
})

describe('pegada por arma', () => {
  it('sem entrada não há pegada; a gravada é lida', () => {
    expect(gripsFromConfig(config()).size).toBe(0)
    const next = applyGrips(config(), new Map([['ARM-02', { offset: [0.01, 0.0812345678, 0], rotation: TURN }]]))
    const grip = gripsFromConfig(next).get('ARM-02')!
    expect(grip.offset).toEqual([0.01, 0.081235, 0])
    expect((next['skinned'] as JsonObject)['weaponGrips']).toEqual({ 'ARM-02': { offset: [0.01, 0.081235, 0], rotation: [0, 0.707107, 0, 0.707107] } })
  })

  it('igual ao padrão remove a entrada; sem entradas remove o campo', () => {
    const withGrip = applyGrips(config(), new Map([['ARM-02', { offset: [0, 0, 0], rotation: TURN }]]))
    const back = applyGrips(withGrip, new Map([['ARM-02', { ...DEFAULT_GRIP }]]))
    expect('weaponGrips' in (back['skinned'] as JsonObject)).toBe(false)
  })

  it('pegada inválida é ignorada', () => {
    const cfg = parseConfigObject(JSON.stringify({ skinned: { weaponGrips: { A: { offset: [0, 0], rotation: TURN }, B: { offset: [0, 0, 0], rotation: [0, 0, 0, 0] } } } }))
    expect(gripsFromConfig(cfg).size).toBe(0)
  })
})

describe('armas do projeto', () => {
  it('GLB das armas: o da config ou o padrão', () => {
    expect(weaponsGlbOf(null)).toBe(DEFAULT_WEAPONS_GLB)
    expect(weaponsGlbOf(config())).toBe(DEFAULT_WEAPONS_GLB)
    expect(weaponsGlbOf(parseConfigObject('{"skinned":{"weaponsGlb":"assets/x.glb"}}'))).toBe('assets/x.glb')
  })

  it('arma = nó raiz com filho *_Grip_L, em ordem de nome', () => {
    const list = weaponsFromNodes([
      { name: 'ESC-01', children: ['ESC-01_Body', 'ESC-01_Grip_L'] },
      { name: 'Luz', children: [] },
      { name: 'ARM-02', children: ['ARM-02_Grip_L', 'ARM-02_Muzzle'] },
      { name: 'X@Y', children: ['X@Y_Grip_L'] },
    ])
    expect(list).toEqual([{ code: 'ARM-02', gripL: 'ARM-02_Grip_L' }, { code: 'ESC-01', gripL: 'ESC-01_Grip_L' }])
  })
})
