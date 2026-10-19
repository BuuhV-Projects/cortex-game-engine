/**
 * Seleção dos FBX do rig (`skinned.clips`) da aba Pasta do painel auto-rig
 * (SPEC-0349, adendo 1).
 */

import { describe, it, expect } from 'vitest'
import {
  applySelection,
  buildRows,
  fbxDirOf,
  filterRows,
  normalizeSearch,
  parseConfigObject,
  removedGameClips,
  selectedClips,
  selectionCount,
  selectionFromConfig,
  serializeConfig,
  uniqueClipName,
  type JsonObject,
  type SelectionState,
} from '../../electron/renderer/characterRigSelection.js'
import type { RigClip } from '../../electron/renderer/characterRigRegistry.js'

/** Recorte da config real do LUC-01 (ordem de chaves e flags do jogo). */
const CONFIG = {
  code: 'LUC-01',
  source: 'D:/Codex/lucas.glb',
  transform: { rotateZDeg: -90 },
  skinned: {
    fbx: 'animations/characters/basic-locomotion',
    markers: 'tools/characters/LUC-01.markers.json',
    clips: {
      idle: { file: 'idle.fbx', loop: true },
      walk: { file: 'walking.fbx', loop: true, rootMotion: true },
      jump: { file: 'jump.fbx', loop: false, jump: true },
      turnLeft90: { file: 'left turn 90.fbx', loop: false },
    },
    preview: [{ label: 'andar', clip: 'walk' }],
    publish: { glb: 'assets/p/LUC-01-skinned.glb' },
  },
}

const TEXT = `\uFEFF${JSON.stringify(CONFIG, null, 1)}\n`
const DIR = ['idle.fbx', 'walking.fbx', 'jump.fbx', 'left turn 90.fbx', 'running.fbx', 'Right Strafe.FBX', 'notas.txt', 'walk.fbx']
const RIG: RigClip[] = [
  { name: 'idle', file: 'idle.fbx', loop: true, duration: 8.3 },
  { name: 'walk', file: 'Walking.fbx', loop: true, duration: 1.03 },
  { name: 'jump', file: 'jump.fbx', loop: false, duration: 2.17 },
]

function cfg(): JsonObject {
  return parseConfigObject(TEXT)
}

describe('leitura', () => {
  it('lê skinned.clips com flags do jogo, a pasta e o estado inicial', () => {
    const c = cfg()
    expect(fbxDirOf(c)).toBe('animations/characters/basic-locomotion')
    const clips = selectedClips(c)
    expect(clips.map((x) => x.name)).toEqual(['idle', 'walk', 'jump', 'turnLeft90'])
    expect(clips[1]!.flags).toEqual(['rootMotion'])
    expect(clips[0]!.flags).toEqual([])
    const sel = selectionFromConfig(c)
    expect([...sel.keys()]).toEqual(['idle.fbx', 'walking.fbx', 'jump.fbx', 'left turn 90.fbx'])
  })

  it('config sem skinned.clips: seleção vazia', () => {
    expect(selectedClips({ code: 'X' })).toEqual([])
    expect(fbxDirOf({ skinned: {} })).toBeNull()
  })
})

describe('nome único', () => {
  it('sufixo numérico na colisão', () => {
    expect(uniqueClipName('walk', new Set(['idle']))).toBe('walk')
    expect(uniqueClipName('walk', new Set(['walk']))).toBe('walk2')
    expect(uniqueClipName('walk', new Set(['walk', 'walk2']))).toBe('walk3')
    expect(uniqueClipName('', new Set())).toBe('clip')
  })
})

describe('applySelection', () => {
  it('sem mudança: mesmo texto (resto e ordem preservados, formato do jogo)', () => {
    const c = cfg()
    expect(serializeConfig(applySelection(c, selectionFromConfig(c)))).toBe(TEXT.slice(1))
  })

  it('marcar novo acrescenta no fim com nome camelCase e loop false; colisão ganha sufixo', () => {
    const c = cfg()
    const sel = selectionFromConfig(c)
    sel.set('running.fbx', { file: 'running.fbx', loop: false })
    sel.set('walk.fbx', { file: 'walk.fbx', loop: false })
    const out = applySelection(c, sel)
    const clips = (out['skinned'] as JsonObject)['clips'] as JsonObject
    expect(Object.keys(clips)).toEqual(['idle', 'walk', 'jump', 'turnLeft90', 'running', 'walk2'])
    expect(clips['running']).toEqual({ file: 'running.fbx', loop: false })
    expect(clips['walk2']).toEqual({ file: 'walk.fbx', loop: false })
    // o resto da config, na mesma ordem
    expect(Object.keys(out)).toEqual(['code', 'source', 'transform', 'skinned'])
    expect(Object.keys(out['skinned'] as JsonObject)).toEqual(['fbx', 'markers', 'clips', 'preview', 'publish'])
    expect(c).toEqual(cfg()) // não muda a entrada
  })

  it('desmarcar remove; laço muda só `loop` e mantém flags e posição', () => {
    const c = cfg()
    const sel: SelectionState = selectionFromConfig(c)
    sel.delete('idle.fbx')
    sel.set('walking.fbx', { file: 'walking.fbx', loop: false })
    const clips = (applySelection(c, sel)['skinned'] as JsonObject)['clips'] as JsonObject
    expect(Object.keys(clips)).toEqual(['walk', 'jump', 'turnLeft90'])
    expect(clips['walk']).toEqual({ file: 'walking.fbx', loop: false, rootMotion: true })
  })

  it('cria skinned.clips quando falta', () => {
    const sel: SelectionState = new Map([['a b.fbx', { file: 'a b.fbx', loop: true }]])
    const out = applySelection({ code: 'X', skinned: { fbx: 'f' } }, sel)
    expect(out).toEqual({ code: 'X', skinned: { fbx: 'f', clips: { aB: { file: 'a b.fbx', loop: true } } } })
  })

  it('removedGameClips: só os desmarcados com flags', () => {
    const c = cfg()
    const sel = selectionFromConfig(c)
    sel.delete('walking.fbx')
    sel.delete('idle.fbx')
    sel.delete('jump.fbx')
    expect(removedGameClips(c, sel).map((x) => x.name)).toEqual(['walk', 'jump'])
  })
})

describe('linhas, estados e busca', () => {
  it('estados: no rig, gere de novo, não selecionada; ausente da pasta no fim', () => {
    const c = cfg()
    const sel = selectionFromConfig(c)
    sel.delete('idle.fbx')
    sel.set('running.fbx', { file: 'running.fbx', loop: false })
    sel.set('sumiu.fbx', { file: 'sumiu.fbx', loop: false })
    const rows = buildRows(DIR, applySelection(c, sel), RIG)
    expect(rows.map((r) => r.file)).toEqual(['idle.fbx', 'jump.fbx', 'left turn 90.fbx', 'Right Strafe.FBX', 'running.fbx', 'walk.fbx', 'walking.fbx', 'sumiu.fbx'])
    const by = Object.fromEntries(rows.map((r) => [r.file, r]))
    expect(by['idle.fbx']).toMatchObject({ selected: false, state: 'unselected', inRig: true })
    expect(by['walking.fbx']).toMatchObject({ selected: true, state: 'generated', name: 'walk', flags: ['rootMotion'] })
    expect(by['left turn 90.fbx']).toMatchObject({ selected: true, state: 'pending', name: 'turnLeft90' })
    expect(by['running.fbx']).toMatchObject({ selected: true, state: 'pending', name: 'running' })
    expect(by['Right Strafe.FBX']).toMatchObject({ selected: false, state: 'unselected', name: 'rightStrafe' })
    expect(by['walk.fbx']!.name).toBe('walk2') // o nome que ganharia
    expect(by['sumiu.fbx']).toMatchObject({ missing: true, selected: true })
    expect(selectionCount(rows)).toEqual({ selected: 4, total: 7 })
  })

  it('busca por arquivo ou clipe, sem caixa nem acento', () => {
    const rows = buildRows(DIR, cfg(), RIG)
    expect(normalizeSearch('Ação')).toBe('acao')
    expect(filterRows(rows, 'TURN').map((r) => r.file)).toEqual(['left turn 90.fbx'])
    expect(filterRows(rows, 'turnleft').map((r) => r.file)).toEqual(['left turn 90.fbx'])
    expect(filterRows(rows, 'wálk').map((r) => r.file)).toEqual(['walk.fbx', 'walking.fbx'])
    expect(filterRows(rows, '  ')).toHaveLength(rows.length)
  })
})
