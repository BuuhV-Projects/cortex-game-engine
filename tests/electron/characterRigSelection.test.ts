/**
 * Seleção dos FBX do rig (`skinned.clips`) da aba Pasta do painel auto-rig
 * (SPEC-0349, adendos 1 e 6).
 */

import { describe, it, expect } from 'vitest'
import {
  applySelection,
  autoClipName,
  buildRows,
  fbxDirOf,
  fileBaseName,
  fileKey,
  fileLabel,
  filterRows,
  groupRows,
  listFbxRecursive,
  normalizeRelPath,
  normalizeSearch,
  packageOf,
  rebaseRigFile,
  parseConfigObject,
  removedGameClips,
  selectedClips,
  selectionCount,
  selectionFromConfig,
  serializeConfig,
  uniqueClipName,
  type DirEntry,
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

// ── Adendo 6: vários pacotes (subpastas de `skinned.fbx`) ─────────────────────

/** Config nova: `skinned.fbx` = raiz dos pacotes, `file` com a subpasta. */
const MULTI = {
  code: 'LUC-01',
  skinned: {
    fbx: 'assets/animations/characters',
    clips: {
      idle: { file: 'basic-locomotion/idle.fbx', loop: true },
      walk: { file: 'basic-locomotion/walking.fbx', loop: true, rootMotion: true },
    },
  },
}
const MULTI_FILES = [
  'basic-locomotion/idle.fbx',
  'basic-locomotion/walking.fbx',
  'pistol-locomotion/idle.fbx',
  'pistol-locomotion/pistol walk.fbx',
  'pistol-locomotion/pistol run.fbx',
]

function multi(): JsonObject {
  return parseConfigObject(JSON.stringify(MULTI))
}

describe('caminhos relativos', () => {
  it('normaliza barras do Windows, ./ e barras repetidas', () => {
    expect(normalizeRelPath('pistol-locomotion\\pistol walk.fbx')).toBe('pistol-locomotion/pistol walk.fbx')
    expect(normalizeRelPath('./a//b/./c.fbx')).toBe('a/b/c.fbx')
    expect(fileKey('Pistol-Locomotion\\Pistol Walk.FBX')).toBe('pistol-locomotion/pistol walk.fbx')
  })

  it('pacote, nome e rótulo', () => {
    expect(packageOf('pistol-locomotion/pistol walk.fbx')).toBe('pistol-locomotion')
    expect(packageOf('a\\b\\c.fbx')).toBe('a/b')
    expect(packageOf('walking.fbx')).toBe('')
    expect(fileBaseName('pistol-locomotion\\pistol walk.fbx')).toBe('pistol walk.fbx')
    expect(fileLabel('pistol-locomotion/pistol walk.fbx')).toBe('pistol-locomotion · pistol walk.fbx')
    expect(fileLabel('walking.fbx')).toBe('walking.fbx')
  })

  it('rebaseRigFile: registro antigo (animations = pacote) vira relativo à raiz; o novo fica', () => {
    const P = 'D:/jogo'
    expect(rebaseRigFile(P, 'assets/animations/characters/basic-locomotion', 'walking.fbx', 'assets/animations/characters')).toBe('basic-locomotion/walking.fbx')
    expect(rebaseRigFile(P, 'assets/animations/characters', 'basic-locomotion/walking.fbx', 'assets/animations/characters')).toBe('basic-locomotion/walking.fbx')
    // absoluto × relativo, \ e caixa diferentes
    expect(rebaseRigFile(P, 'D:\\Jogo\\assets\\animations\\characters\\basic-locomotion', 'idle.fbx', './assets/animations/characters/')).toBe('basic-locomotion/idle.fbx')
    // config antiga (raiz = o pacote) com registro igual: sem mudança
    expect(rebaseRigFile(P, 'assets/animations/characters/basic-locomotion', 'idle.fbx', 'assets/animations/characters/basic-locomotion')).toBe('idle.fbx')
    // fora da raiz: fica como está
    expect(rebaseRigFile(P, 'outro/lugar', 'x\\y.fbx', 'assets/animations/characters')).toBe('x/y.fbx')
  })
})

describe('listFbxRecursive', () => {
  const tree: Record<string, DirEntry[]> = {
    'R:/anim': [
      { name: 'pistol-locomotion', isDir: true },
      { name: 'basic-locomotion', isDir: true },
      { name: 'solto.FBX', isDir: false },
      { name: 'notas.txt', isDir: false },
      { name: '.cache', isDir: true },
    ],
    'R:/anim/basic-locomotion': [{ name: 'walking.fbx', isDir: false }, { name: 'idle.fbx', isDir: false }],
    'R:/anim/pistol-locomotion': [{ name: 'pistol walk.fbx', isDir: false }, { name: 'extra', isDir: true }],
    'R:/anim/pistol-locomotion/extra': [{ name: 'a.fbx', isDir: false }],
  }
  const readDir = async (dir: string): Promise<DirEntry[]> => {
    const e = tree[dir]
    if (!e) throw new Error(`não existe: ${dir}`)
    return e
  }

  it('lista recursivo, relativo à raiz com /, raiz primeiro e por pacote; ignora pasta com ponto', async () => {
    expect(await listFbxRecursive(readDir, 'R:/anim')).toEqual([
      'solto.FBX',
      'basic-locomotion/idle.fbx',
      'basic-locomotion/walking.fbx',
      'pistol-locomotion/pistol walk.fbx',
      'pistol-locomotion/extra/a.fbx',
    ])
  })

  it('erro de leitura sobe', async () => {
    await expect(listFbxRecursive(readDir, 'R:/nada')).rejects.toThrow('não existe')
  })
})

describe('nome automático com pacotes', () => {
  it('camelCase do arquivo, sem a pasta', () => {
    expect(autoClipName('pistol-locomotion/pistol walk.fbx', new Set())).toBe('pistolWalk')
  })

  it('colisão: prefixa o pacote; colidindo de novo, sufixo; raiz vai direto ao sufixo', () => {
    expect(autoClipName('pistol-locomotion/idle.fbx', new Set(['idle']))).toBe('pistolLocomotionIdle')
    expect(autoClipName('pistol-locomotion\\idle.fbx', new Set(['idle', 'pistolLocomotionIdle']))).toBe('pistolLocomotionIdle2')
    expect(autoClipName('idle.fbx', new Set(['idle']))).toBe('idle2')
  })

  it('applySelection grava file relativo à raiz com / e o nome pela regra', () => {
    const c = multi()
    const sel = selectionFromConfig(c)
    sel.set(fileKey('pistol-locomotion/pistol walk.fbx'), { file: 'pistol-locomotion/pistol walk.fbx', loop: false })
    sel.set(fileKey('pistol-locomotion\\idle.fbx'), { file: normalizeRelPath('pistol-locomotion\\idle.fbx'), loop: true })
    const clips = (applySelection(c, sel)['skinned'] as JsonObject)['clips'] as JsonObject
    expect(Object.keys(clips)).toEqual(['idle', 'walk', 'pistolWalk', 'pistolLocomotionIdle'])
    expect(clips['pistolWalk']).toEqual({ file: 'pistol-locomotion/pistol walk.fbx', loop: false })
    expect(clips['pistolLocomotionIdle']).toEqual({ file: 'pistol-locomotion/idle.fbx', loop: true })
  })

  it('config com \\ no file casa com o caminho listado (não duplica)', () => {
    const c = parseConfigObject(JSON.stringify({ skinned: { fbx: 'r', clips: { walk: { file: 'basic-locomotion\\walking.fbx', loop: true } } } }))
    const rows = buildRows(['basic-locomotion/walking.fbx'], c, [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'walk', selected: true, missing: false, pkg: 'basic-locomotion' })
  })
})

describe('linhas agrupadas por pacote', () => {
  it('config nova: estados comparando file relativo, nome que ganharia, grupos com contador', () => {
    const c = multi()
    const sel = selectionFromConfig(c)
    sel.set(fileKey('pistol-locomotion/sumiu.fbx'), { file: 'pistol-locomotion/sumiu.fbx', loop: false })
    const rig = [{ file: 'basic-locomotion/walking.fbx' }, { file: 'basic-locomotion/idle.fbx' }]
    const rows = buildRows(MULTI_FILES, applySelection(c, sel), rig)
    const by = Object.fromEntries(rows.map((r) => [r.file, r]))
    expect(by['basic-locomotion/walking.fbx']).toMatchObject({ state: 'generated', name: 'walk', pkg: 'basic-locomotion' })
    expect(by['pistol-locomotion/idle.fbx']).toMatchObject({ state: 'unselected', name: 'pistolLocomotionIdle', pkg: 'pistol-locomotion' })
    expect(by['pistol-locomotion/pistol walk.fbx']!.name).toBe('pistolWalk')
    expect(by['pistol-locomotion/sumiu.fbx']).toMatchObject({ missing: true, state: 'pending' })

    const groups = groupRows(rows, '')
    expect(groups.map((g) => [g.pkg, g.selected, g.total])).toEqual([
      ['basic-locomotion', 2, 2],
      ['pistol-locomotion', 0, 3],
    ])
    // ausente no fim do próprio pacote
    expect(groups[1]!.rows.map((r) => r.file)).toEqual([
      'pistol-locomotion/idle.fbx',
      'pistol-locomotion/pistol run.fbx',
      'pistol-locomotion/pistol walk.fbx',
      'pistol-locomotion/sumiu.fbx',
    ])
    expect(selectionCount(rows)).toEqual({ selected: 2, total: 5 })
  })

  it('busca em todos os pacotes (arquivo, pacote, clipe); pacote sem linha some; contador do pacote inteiro', () => {
    const rows = buildRows(MULTI_FILES, multi(), [])
    expect(filterRows(rows, 'walk').map((r) => r.file)).toEqual(['basic-locomotion/walking.fbx', 'pistol-locomotion/pistol walk.fbx'])
    expect(filterRows(rows, 'PISTOL-loco')).toHaveLength(3)
    expect(filterRows(rows, 'pistollocomotionidle').map((r) => r.file)).toEqual(['pistol-locomotion/idle.fbx'])
    const groups = groupRows(rows, 'run')
    expect(groups.map((g) => g.pkg)).toEqual(['pistol-locomotion'])
    expect(groups[0]).toMatchObject({ selected: 0, total: 3 })
    expect(groups[0]!.rows.map((r) => r.file)).toEqual(['pistol-locomotion/pistol run.fbx'])
  })

  it('config antiga (fbx = o pacote, file sem barra): um grupo só, na raiz, como antes', () => {
    const rows = buildRows(DIR, cfg(), RIG)
    const groups = groupRows(rows, '')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.pkg).toBe('')
    expect(groups[0]!.rows.map((r) => r.file)).toEqual(rows.map((r) => r.file))
    expect(rows.find((r) => r.file === 'walking.fbx')).toMatchObject({ state: 'generated', name: 'walk' })
  })
})
