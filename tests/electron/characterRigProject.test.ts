import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasRigPipeline, resolveTab, rigPanelMode } from '../../electron/renderer/characterRigProject.js'

describe('rigPanelMode (SPEC-0704)', () => {
  it('com o prepare-character.sh: as três abas e gerar/revisar', () => {
    expect(rigPanelMode({ hasPipeline: true })).toEqual({ tabs: ['markers', 'animations', 'folder'], canGenerate: true })
  })

  it('só com o GLB publicado: só Animações, sem gerar nem revisar', () => {
    expect(rigPanelMode({ hasPipeline: false })).toEqual({ tabs: ['animations'], canGenerate: false })
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
