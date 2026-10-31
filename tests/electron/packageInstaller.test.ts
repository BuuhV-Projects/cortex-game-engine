/**
 * Instalador de pacotes de textura (SPEC-0641 §4): leitor de zip, cortex.json +
 * lock, download com SHA-256, cache e troca atômica da pasta instalada.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
import { deflateRawSync, crc32 } from 'zlib'
import { readZip, isSafeZipPath } from '../../electron/packages/zipReader.js'
import { readDeclaredPackages, setDeclaredPackage, readLock } from '../../electron/packages/projectPackages.js'
import { installPackage, syncPackages, uninstallPackage, type AssetDownloader } from '../../electron/packages/installer.js'

/** Zip mínimo (deflate) — mesmo formato que o script de conversão gera. */
function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const locals: Buffer[] = []
  const cens: Buffer[] = []
  let off = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content)
    const comp = deflateRawSync(data)
    const n = Buffer.from(name)
    const loc = Buffer.alloc(30)
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8)
    loc.writeUInt32LE(crc32(data), 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(data.length, 22)
    loc.writeUInt16LE(n.length, 26)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(crc32(data), 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(off, 42)
    locals.push(loc, n, comp)
    cens.push(cen, n)
    off += 30 + n.length + comp.length
  }
  const cenBuf = Buffer.concat(cens)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cenBuf.length, 12); eocd.writeUInt32LE(off, 16)
  return new Uint8Array(Buffer.concat([...locals, cenBuf, eocd]))
}

const ID = 'cortex-test-textures'
const manifest = (version = '1.0.0', archive?: object) => ({
  schema: 1, id: ID, kind: 'textures', name: 'Teste', version,
  license: { spdx: 'CC0-1.0', redistributable: true },
  ...(archive ? { archive } : {}),
  materials: [{ id: 'grass', name: 'Grass', size: 4, maps: { color: 'materials/grass/color.jpg' } }],
})

function release(version = '1.0.0') {
  const zip = makeZip({
    'cortex-package.json': JSON.stringify(manifest(version)),
    'materials/grass/color.jpg': `jpg-${version}`,
  })
  const sha = createHash('sha256').update(zip).digest('hex')
  const file = `${ID}-${version}.zip`
  return { zip, sha, file, manifest: JSON.stringify(manifest(version, { file, sha256: sha, bytes: zip.length })) }
}

let dir: string
let cache: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cortex-proj-'))
  cache = mkdtempSync(join(tmpdir(), 'cortex-cache-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(cache, { recursive: true, force: true })
})

/** Downloader falso servindo um release; conta as chamadas. */
function fakeRelease(r: ReturnType<typeof release>) {
  const calls: string[] = []
  const dl: AssetDownloader = async (repo, tag, file) => {
    calls.push(`${repo}@${tag}/${file}`)
    if (file === 'cortex-package.json') return new Uint8Array(Buffer.from(r.manifest))
    if (file === r.file) return r.zip
    return null
  }
  return { dl, calls }
}

describe('readZip', () => {
  it('lê entradas deflate', () => {
    const entries = readZip(makeZip({ 'a.txt': 'oi', 'b/c.txt': 'tchau' }))
    expect(entries.map((e) => [e.path, Buffer.from(e.data).toString()])).toEqual([['a.txt', 'oi'], ['b/c.txt', 'tchau']])
  })
  it('recusa caminho que escapa da pasta', () => {
    expect(() => readZip(makeZip({ '../x.txt': 'x' }))).toThrow(/inseguro/)
    expect(isSafeZipPath('C:/x')).toBe(false)
    expect(isSafeZipPath('materials/a/color.jpg')).toBe(true)
  })
})

describe('cortex.json#packages', () => {
  it('lê string e objeto, com repo padrão da org e erros por entrada', async () => {
    writeFileSync(join(dir, 'cortex.json'), JSON.stringify({
      id: 'jogo',
      packages: { [ID]: '1.0.0', outro: { version: '2.1.0', repo: 'fulano/outro' }, ruim: 'latest' },
    }))
    const { packages, errors } = await readDeclaredPackages(dir)
    expect(packages).toEqual([
      { id: ID, version: '1.0.0', repo: `BuuhV-Projects/${ID}` },
      { id: 'outro', version: '2.1.0', repo: 'fulano/outro' },
    ])
    expect(errors).toEqual(['ruim: versão deve ser exata (X.Y.Z)'])
  })
  it('add/remove preserva o resto do cortex.json', async () => {
    writeFileSync(join(dir, 'cortex.json'), JSON.stringify({ id: 'jogo', name: 'Jogo' }))
    await setDeclaredPackage(dir, ID, '1.0.0')
    expect(JSON.parse(readFileSync(join(dir, 'cortex.json'), 'utf-8'))).toEqual({ id: 'jogo', name: 'Jogo', packages: { [ID]: '1.0.0' } })
    await setDeclaredPackage(dir, ID, null)
    expect(JSON.parse(readFileSync(join(dir, 'cortex.json'), 'utf-8'))).toEqual({ id: 'jogo', name: 'Jogo' })
  })
})

describe('installPackage', () => {
  const pkg = (version = '1.0.0') => ({ id: ID, version, repo: `BuuhV-Projects/${ID}` })

  it('baixa, confere SHA, extrai e grava o lock', async () => {
    const r = release()
    const { dl } = fakeRelease(r)
    const res = await installPackage(dir, pkg(), { downloaders: [dl], cacheDir: cache })
    expect(res.status).toBe('installed')
    expect(readFileSync(join(dir, 'assets/packages', ID, 'materials/grass/color.jpg'), 'utf-8')).toBe('jpg-1.0.0')
    expect(await readLock(dir)).toEqual({ [ID]: { version: '1.0.0', sha256: r.sha } })
    expect(existsSync(join(cache, ID, '1.0.0.zip'))).toBe(true)
  })

  it('segunda chamada é no-op; reinstalação usa o cache sem rede', async () => {
    const r = release()
    const { dl, calls } = fakeRelease(r)
    await installPackage(dir, pkg(), { downloaders: [dl], cacheDir: cache })
    expect((await installPackage(dir, pkg(), { downloaders: [dl], cacheDir: cache })).status).toBe('up-to-date')
    rmSync(join(dir, 'assets'), { recursive: true })
    calls.length = 0
    expect((await installPackage(dir, pkg(), { downloaders: [dl], cacheDir: cache })).status).toBe('installed')
    expect(calls).toEqual([])
  })

  it('recusa zip adulterado (SHA não confere) e não cria a pasta', async () => {
    const r = release()
    const bad = { ...r, zip: makeZip({ 'cortex-package.json': JSON.stringify(manifest()), 'x.jpg': 'mal' }) }
    const res = await installPackage(dir, pkg(), { downloaders: [fakeRelease(bad).dl], cacheDir: cache })
    expect(res.status).toBe('error')
    expect(res.error).toMatch(/SHA-256/)
    expect(existsSync(join(dir, 'assets/packages', ID))).toBe(false)
  })

  it('cai pro próximo downloader quando o primeiro não acha (repo privado → gh)', async () => {
    const r = release()
    const publico: AssetDownloader = async () => null
    const res = await installPackage(dir, pkg(), { downloaders: [publico, fakeRelease(r).dl], cacheDir: cache })
    expect(res.status).toBe('installed')
  })

  it('sem nenhum downloader achando, erro explica o gh auth', async () => {
    const res = await installPackage(dir, pkg(), { downloaders: [async () => null], cacheDir: cache })
    expect(res.error).toMatch(/gh auth login/)
  })

  it('trocar de versão substitui a pasta', async () => {
    await installPackage(dir, pkg('1.0.0'), { downloaders: [fakeRelease(release('1.0.0')).dl], cacheDir: cache })
    await installPackage(dir, pkg('1.1.0'), { downloaders: [fakeRelease(release('1.1.0')).dl], cacheDir: cache })
    expect(readFileSync(join(dir, 'assets/packages', ID, 'materials/grass/color.jpg'), 'utf-8')).toBe('jpg-1.1.0')
    expect((await readLock(dir))[ID].version).toBe('1.1.0')
  })
})

describe('syncPackages / uninstallPackage', () => {
  it('instala o declarado e remove limpa pasta e lock', async () => {
    writeFileSync(join(dir, 'cortex.json'), JSON.stringify({ packages: { [ID]: '1.0.0' } }))
    const { results } = await syncPackages(dir, { downloaders: [fakeRelease(release()).dl], cacheDir: cache })
    expect(results.map((r) => r.status)).toEqual(['installed'])
    await uninstallPackage(dir, ID)
    expect(existsSync(join(dir, 'assets/packages', ID))).toBe(false)
    expect(await readLock(dir)).toEqual({})
  })
})
