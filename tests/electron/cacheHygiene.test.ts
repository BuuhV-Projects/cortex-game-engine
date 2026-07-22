/**
 * Higiene do disk cache do Chromium entre sessões (electron/cacheHygiene.ts).
 *
 * Contrato travado aqui:
 * (1) shutdown limpo → boot seguinte NÃO mexe no cache (boot rápido);
 * (2) shutdown sujo (sentinela sobreviveu) → purga os caches blockfile;
 * (3) a purga esvazia o CONTEÚDO mas mantém a raiz (armadilha do
 *     delete-pending no Windows — ADR-0101);
 * (4) só `Cache`/`Code Cache` são tocados: `GPUCache` e afins ficam intactos;
 * (5) o ciclo start→end→boot converge (não purga em looping).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  BLOCKFILE_CACHE_DIRS,
  SESSION_SENTINEL,
  emptyDirContents,
  isUncleanShutdown,
  markSessionEnd,
  markSessionStart,
  purgeBlockfileCaches,
  recoverCacheIfUnclean,
} from '../../electron/cacheHygiene.js'

let userData: string

/** Monta um userData realista: caches blockfile povoados + GPUCache. */
function seedCaches(): void {
  const cacheData = path.join(userData, 'Cache', 'Cache_Data')
  fs.mkdirSync(cacheData, { recursive: true })
  fs.writeFileSync(path.join(cacheData, 'index'), 'x')
  fs.writeFileSync(path.join(cacheData, 'data_0'), 'x')
  fs.writeFileSync(path.join(cacheData, 'f_000001'), 'x')

  const codeCache = path.join(userData, 'Code Cache', 'js')
  fs.mkdirSync(codeCache, { recursive: true })
  fs.writeFileSync(path.join(codeCache, 'index'), 'x')

  const gpu = path.join(userData, 'GPUCache')
  fs.mkdirSync(gpu, { recursive: true })
  fs.writeFileSync(path.join(gpu, 'data_1'), 'x')
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-cachehygiene-'))
})
afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('sentinela de sessão', () => {
  it('boot limpo: sem sentinela, nada a recuperar', () => {
    expect(isUncleanShutdown(userData)).toBe(false)
  })

  it('markSessionStart cria a sentinela; markSessionEnd remove', () => {
    markSessionStart(userData)
    expect(fs.existsSync(path.join(userData, SESSION_SENTINEL))).toBe(true)
    expect(isUncleanShutdown(userData)).toBe(true)

    markSessionEnd(userData)
    expect(isUncleanShutdown(userData)).toBe(false)
  })

  it('markSessionEnd é idempotente (shutdown sem sentinela não estoura)', () => {
    expect(() => markSessionEnd(userData)).not.toThrow()
  })

  it('markSessionStart cria o userData quando ele ainda não existe', () => {
    const fresh = path.join(userData, 'perfil-novo')
    markSessionStart(fresh)
    expect(fs.existsSync(path.join(fresh, SESSION_SENTINEL))).toBe(true)
  })
})

describe('emptyDirContents', () => {
  it('esvazia o conteúdo mas MANTÉM a raiz (sem delete-pending)', () => {
    const dir = path.join(userData, 'Cache')
    fs.mkdirSync(path.join(dir, 'Cache_Data'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'Cache_Data', 'index'), 'x')

    emptyDirContents(dir)

    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('cria o diretório quando ele não existe', () => {
    const dir = path.join(userData, 'Cache')
    emptyDirContents(dir)
    expect(fs.existsSync(dir)).toBe(true)
  })
})

describe('purgeBlockfileCaches', () => {
  it('limpa Cache e Code Cache, preservando GPUCache', () => {
    seedCaches()

    const purged = purgeBlockfileCaches(userData)

    expect(purged.sort()).toEqual([...BLOCKFILE_CACHE_DIRS].sort())
    expect(fs.readdirSync(path.join(userData, 'Cache'))).toEqual([])
    expect(fs.readdirSync(path.join(userData, 'Code Cache'))).toEqual([])
    // GPUCache usa outro backend — não é fonte do erro, não se mexe.
    expect(fs.readdirSync(path.join(userData, 'GPUCache'))).toEqual(['data_1'])
  })

  it('ignora caches ausentes (perfil novo) sem estourar', () => {
    expect(purgeBlockfileCaches(userData)).toEqual([])
  })
})

describe('recoverCacheIfUnclean', () => {
  it('shutdown LIMPO: preserva o cache e arma a sentinela', () => {
    seedCaches()

    const purged = recoverCacheIfUnclean(userData)

    expect(purged).toEqual([])
    expect(fs.existsSync(path.join(userData, 'Cache', 'Cache_Data', 'index'))).toBe(true)
    expect(isUncleanShutdown(userData)).toBe(true) // sessão agora está viva
  })

  it('shutdown SUJO: purga o cache corrompido e rearma a sentinela', () => {
    seedCaches()
    markSessionStart(userData) // sessão anterior morreu à força

    const purged = recoverCacheIfUnclean(userData)

    expect(purged.sort()).toEqual([...BLOCKFILE_CACHE_DIRS].sort())
    expect(fs.readdirSync(path.join(userData, 'Cache'))).toEqual([])
    expect(isUncleanShutdown(userData)).toBe(true) // sentinela da sessão nova
  })

  it('ciclo completo converge: start → end → boot não purga nada', () => {
    seedCaches()
    markSessionStart(userData)
    markSessionEnd(userData)

    expect(recoverCacheIfUnclean(userData)).toEqual([])
    expect(fs.existsSync(path.join(userData, 'Cache', 'Cache_Data', 'index'))).toBe(true)
  })

  it('userData vazio (indisponível) é no-op', () => {
    expect(recoverCacheIfUnclean('')).toEqual([])
  })
})
