/**
 * Gravação do assado do auto-rig (SPEC-0704): par GLB + JSON com backup, só dentro do projeto.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BAKE_BACKUP_SUFFIX, BAKE_TMP_SUFFIX, insideProject, writeBakePair } from '../../electron/main/characterRigBakeWrite'

let dir = ''
const GLB = 'assets/p/LUC-01-skinned.glb'
const JSON_REL = 'assets/p/LUC-01-skinned.json'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rigbake-'))
  mkdirSync(join(dir, 'assets/p'), { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('writeBakePair', () => {
  it('grava o par e guarda o anterior em .bak', () => {
    writeFileSync(join(dir, GLB), Uint8Array.from([1, 2]))
    writeFileSync(join(dir, JSON_REL), '{"old":1}')
    writeBakePair(dir, GLB, JSON_REL, Uint8Array.from([3, 4, 5]), '{"new":1}')
    expect([...readFileSync(join(dir, GLB))]).toEqual([3, 4, 5])
    expect(readFileSync(join(dir, JSON_REL), 'utf8')).toBe('{"new":1}')
    expect([...readFileSync(join(dir, GLB + BAKE_BACKUP_SUFFIX))]).toEqual([1, 2])
    expect(readFileSync(join(dir, JSON_REL + BAKE_BACKUP_SUFFIX), 'utf8')).toBe('{"old":1}')
    expect(existsSync(join(dir, GLB + BAKE_TMP_SUFFIX))).toBe(false)
  })

  it('sem par anterior não cria .bak', () => {
    writeBakePair(dir, GLB, JSON_REL, Uint8Array.from([9]), '{}')
    expect(existsSync(join(dir, GLB + BAKE_BACKUP_SUFFIX))).toBe(false)
  })

  it('recusa caminho fora do projeto e extensão errada sem tocar em nada', () => {
    expect(() => writeBakePair(dir, '../fora.glb', JSON_REL, Uint8Array.from([1]), '{}')).toThrow(/fora do projeto/)
    expect(() => writeBakePair(dir, 'a.png', JSON_REL, Uint8Array.from([1]), '{}')).toThrow(/\.glb/)
    expect(existsSync(join(dir, JSON_REL))).toBe(false)
    expect(() => insideProject(dir, '.')).toThrow()
  })

  it('falha numa pasta que não existe não deixa .tmp nem muda o par', () => {
    writeFileSync(join(dir, GLB), Uint8Array.from([1]))
    expect(() => writeBakePair(dir, GLB, 'assets/nao-existe/x.json', Uint8Array.from([2]), '{}')).toThrow()
    expect([...readFileSync(join(dir, GLB))]).toEqual([1])
    expect(existsSync(join(dir, GLB + BAKE_TMP_SUFFIX))).toBe(false)
  })

  it('falha na troca do JSON volta o GLB ao par anterior', () => {
    writeFileSync(join(dir, GLB), Uint8Array.from([1]))
    writeFileSync(join(dir, JSON_REL), '{"old":1}')
    let calls = 0
    const flaky = (from: string, to: string): void => {
      if (++calls === 2) throw new Error('EBUSY')
      renameSync(from, to)
    }
    expect(() => writeBakePair(dir, GLB, JSON_REL, Uint8Array.from([2]), '{"new":1}', flaky)).toThrow(/EBUSY/)
    expect([...readFileSync(join(dir, GLB))]).toEqual([1])
    expect(readFileSync(join(dir, JSON_REL), 'utf8')).toBe('{"old":1}')
  })
})
