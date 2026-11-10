import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasRigPipeline, resolveTab, rigPanelMode, sameRigPanelMode } from '../../electron/renderer/characterRigProject.js'
import { parseCharacterConfig } from '../../electron/renderer/characterRig.js'

describe('rigPanelMode (SPEC-0704)', () => {
  it('com o prepare-character.sh: as três abas e gerar/revisar', () => {
    expect(rigPanelMode({ hasPipeline: true })).toEqual({ tabs: ['markers', 'animations', 'folder'], canGenerate: true, builtin: false })
  })

  it('só com o GLB publicado: só Animações, sem gerar nem revisar', () => {
    expect(rigPanelMode({ hasPipeline: false })).toEqual({ tabs: ['animations'], canGenerate: false, builtin: false })
  })
})

describe('pipeline do Studio (SPEC-0724)', () => {
  it('config do Studio sem o script: as três abas, gerar e o botão Blender', () => {
    expect(rigPanelMode({ hasPipeline: false, builtinRig: true })).toEqual({ tabs: ['markers', 'animations', 'folder'], canGenerate: true, builtin: true })
  })

  it('o script do projeto vence: sem o botão Blender', () => {
    expect(rigPanelMode({ hasPipeline: true, builtinRig: true }).builtin).toBe(false)
  })

  it('sameRigPanelMode separa o modo do Studio do só publicado e do script', () => {
    const studio = rigPanelMode({ hasPipeline: false, builtinRig: true })
    expect(sameRigPanelMode(studio, rigPanelMode({ hasPipeline: false, builtinRig: true }))).toBe(true)
    expect(sameRigPanelMode(studio, rigPanelMode({ hasPipeline: false }))).toBe(false)
    expect(sameRigPanelMode(studio, rigPanelMode({ hasPipeline: true }))).toBe(false)
  })

  it('parseCharacterConfig marca builtinRig com work e skinned.publish.{glb,clips}', () => {
    const cfg = { code: 'npc-110', source: 'a.glb', work: 'w', skinned: { publish: { glb: 'a.glb', clips: 'a.json' } } }
    expect(parseCharacterConfig(JSON.stringify(cfg)).builtinRig).toBe(true)
    expect(parseCharacterConfig(JSON.stringify({ ...cfg, work: undefined })).builtinRig).toBe(false)
    expect(parseCharacterConfig(JSON.stringify({ ...cfg, skinned: { publish: { glb: 'a.glb' } } })).builtinRig).toBe(false)
  })
})

describe('hasRigPipeline (SPEC-0704)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const withDir = (readDir: (dir: string) => Promise<Array<{ name: string; isDir: boolean }>>): void => {
    vi.stubGlobal('window', { electronAPI: { readDir } })
  }

  it('acha o prepare-character.sh em tools/ (com barra no fim do projeto)', async () => {
    const seen: string[] = []
    withDir(async (dir) => (seen.push(dir), [{ name: 'prepare-character.sh', isDir: false }]))
    expect(await hasRigPipeline('D:/jogo/')).toBe(true)
    expect(seen).toEqual(['D:/jogo/tools'])
  })

  it('pasta com esse nome, outro script ou tools/ ilegível: sem pipeline', async () => {
    withDir(async () => [{ name: 'prepare-character.sh', isDir: true }, { name: 'build.sh', isDir: false }])
    expect(await hasRigPipeline('D:/jogo')).toBe(false)
    withDir(async () => {
      throw new Error('ENOENT')
    })
    expect(await hasRigPipeline('D:/jogo')).toBe(false)
  })
})

describe('resolveTab (SPEC-0704)', () => {
  const full = rigPanelMode({ hasPipeline: true })
  const published = rigPanelMode({ hasPipeline: false })

  it('sem pipeline: Marcadores e Pasta caem em Animações, mesmo sem rig', () => {
    expect(resolveTab(published, 'markers', false)).toBe('animations')
    expect(resolveTab(published, 'folder', true)).toBe('animations')
  })

  it('com pipeline: a aba pedida; Animações sem rig fica bloqueada', () => {
    expect(resolveTab(full, 'folder', false)).toBe('folder')
    expect(resolveTab(full, 'animations', true)).toBe('animations')
    expect(resolveTab(full, 'animations', false)).toBeNull()
  })
})
