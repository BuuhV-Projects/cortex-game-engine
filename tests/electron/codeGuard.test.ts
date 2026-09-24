/**
 * Fronteira do modo Modelagem (SPEC-0266) e vigia de modelos (SPEC-0267), num
 * projeto temporário de verdade em disco.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { restoreCode, snapshotCode } from '../../electron/agent/codex/codeGuard.js'
import { changedModels, snapshotModels } from '../../electron/agent/codex/modelWatch.js'

let root: string

function put(rel: string, content: string): void {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'modelagem-'))
  put('main.ts', 'original main')
  put('systems/CarSystem.ts', 'original car')
  put('scenes/level.json', '{"nodes":[]}')
  put('vendor/cortex-game-engine/index.js', 'engine')
  put('node_modules/pkg/index.js', 'dep')
})

describe('restoreCode', () => {
  it('desfaz código editado, apagado e criado', async () => {
    const snapshot = await snapshotCode(root)
    put('main.ts', 'EDITADO PELO ASTRA')
    rmSync(join(root, 'systems/CarSystem.ts'))
    put('systems/NovoSistema.ts', 'criado pelo astra')

    const reverted = await restoreCode(root, snapshot)

    expect(reverted).toEqual(['main.ts', 'systems/CarSystem.ts', 'systems/NovoSistema.ts'])
    expect(read('main.ts')).toBe('original main')
    expect(read('systems/CarSystem.ts')).toBe('original car')
    expect(existsSync(join(root, 'systems/NovoSistema.ts'))).toBe(false)
  })

  it('não mexe em dado — é o trabalho do Modelagem', async () => {
    const snapshot = await snapshotCode(root)
    put('scenes/level.json', '{"nodes":[{"id":"arvore"}]}')
    expect(await restoreCode(root, snapshot)).toEqual([])
    expect(read('scenes/level.json')).toContain('arvore')
  })

  it('ignora vendor e node_modules', async () => {
    const snapshot = await snapshotCode(root)
    expect([...snapshot.keys()].sort()).toEqual(['main.ts', 'systems/CarSystem.ts'])
    put('vendor/cortex-game-engine/index.js', 'engine atualizada')
    expect(await restoreCode(root, snapshot)).toEqual([])
  })

  it('turno sem mudança de código devolve lista vazia', async () => {
    expect(await restoreCode(root, await snapshotCode(root))).toEqual([])
  })
})

describe('changedModels', () => {
  it('acha .glb novo e alterado, e ignora o intocado', async () => {
    put('assets/arvore.glb', 'glb v1')
    put('assets/pedra.glb', 'glb pedra')
    const before = await snapshotModels(root)
    put('assets/arvore.glb', 'glb v2 maior')
    put('assets/carro.glb', 'glb novo')
    expect(await changedModels(root, before)).toEqual(['assets/arvore.glb', 'assets/carro.glb'])
  })

  it('pega regravação com o mesmo tamanho pela data', async () => {
    put('assets/arvore.glb', 'aaaa')
    const before = await snapshotModels(root)
    put('assets/arvore.glb', 'bbbb')
    const later = new Date(Date.now() + 5000)
    utimesSync(join(root, 'assets/arvore.glb'), later, later)
    expect(await changedModels(root, before)).toEqual(['assets/arvore.glb'])
  })
})
