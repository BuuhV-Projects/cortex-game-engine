/**
 * Onde está o Blender do auto-rig do Studio (SPEC-0724).
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { locateBlender, type BlenderLocateDeps } from '../../electron/main/autoRig/blenderLocate.js'

const PF = 'C:/Program Files'
const FOUNDATION = join(PF, 'Blender Foundation')

function deps(over: Partial<BlenderLocateDeps> & { files?: string[]; dirs?: Record<string, string[]> }): BlenderLocateDeps {
  const files = new Set(over.files ?? [])
  return {
    preference: over.preference ?? null,
    env: over.env ?? { ProgramFiles: PF },
    platform: over.platform ?? 'win32',
    exists: (p) => files.has(p),
    listDirs: (p) => over.dirs?.[p] ?? [],
  }
}

describe('locateBlender', () => {
  it('a preferência do Studio vence a variável e a instalação', () => {
    const exe = join(FOUNDATION, 'Blender 5.1', 'blender.exe')
    const d = deps({ preference: 'D:/b/blender.exe', env: { ProgramFiles: PF, BLENDER_PATH: 'E:/b.exe' }, files: ['D:/b/blender.exe', 'E:/b.exe', exe], dirs: { [FOUNDATION]: ['Blender 5.1'] } })
    expect(locateBlender(d)).toEqual({ path: 'D:/b/blender.exe', source: 'preference' })
  })

  it('preferência que não existe mais cai em BLENDER_PATH', () => {
    const d = deps({ preference: 'D:/sumiu.exe', env: { ProgramFiles: PF, BLENDER_PATH: 'E:/b.exe' }, files: ['E:/b.exe'] })
    expect(locateBlender(d)).toEqual({ path: 'E:/b.exe', source: 'env' })
  })

  it('no Windows escolhe a maior versão instalada', () => {
    const files = ['4.2', '5.1', '4.10'].map((v) => join(FOUNDATION, `Blender ${v}`, 'blender.exe'))
    const d = deps({ files, dirs: { [FOUNDATION]: ['Blender 4.2', 'Blender 4.10', 'Blender 5.1'] } })
    expect(locateBlender(d)).toEqual({ path: join(FOUNDATION, 'Blender 5.1', 'blender.exe'), source: 'install' })
  })

  it('pula a pasta sem o executável', () => {
    const exe = join(FOUNDATION, 'Blender 4.4', 'blender.exe')
    const d = deps({ files: [exe], dirs: { [FOUNDATION]: ['Blender 5.0', 'Blender 4.4'] } })
    expect(locateBlender(d)?.path).toBe(exe)
  })

  it('no Windows sem nada: null', () => {
    expect(locateBlender(deps({}))).toBeNull()
  })

  it('macOS usa o .app; Linux cai no blender do PATH', () => {
    const mac = '/Applications/Blender.app/Contents/MacOS/Blender'
    expect(locateBlender(deps({ platform: 'darwin', env: {}, files: [mac] }))).toEqual({ path: mac, source: 'install' })
    expect(locateBlender(deps({ platform: 'linux', env: {} }))).toEqual({ path: 'blender', source: 'path' })
  })
})
