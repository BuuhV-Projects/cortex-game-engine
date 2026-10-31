import { inflateRawSync } from 'node:zlib'

/**
 * Leitor de zip mínimo pros pacotes de textura (SPEC-0641). Os zips são gerados
 * pelo nosso script de conversão (deflate/stored, sem zip64, sem criptografia),
 * então não vale uma dependência — mas o leitor recusa explicitamente o que não
 * suporta e qualquer caminho que escape da pasta de destino.
 */

export interface ZipEntry {
  path: string
  data: Uint8Array
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

function findEocd(buf: Buffer): number {
  // EOCD tem 22 bytes + comentário de até 64 KB no fim do arquivo.
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  throw new Error('zip inválido: fim do diretório central não encontrado')
}

/** Caminho seguro: relativo, com "/", sem "..", sem drive. */
export function isSafeZipPath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\') || /^[a-zA-Z]:/.test(p)) return false
  return !p.split('/').some((seg) => seg === '..')
}

/** Lê todas as entradas de ARQUIVO do zip (pastas são ignoradas). */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(buf)
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || p === 0xffffffff) throw new Error('zip64 não suportado')
  const out: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error('zip inválido: entrada do diretório central')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const path = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (path.endsWith('/')) continue
    if (!isSafeZipPath(path)) throw new Error(`zip com caminho inseguro: ${path}`)
    if (flags & 0x1) throw new Error(`zip criptografado não suportado: ${path}`)
    if (buf.readUInt32LE(localOff) !== LOC_SIG) throw new Error(`zip inválido: cabeçalho local de ${path}`)
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28)
    const raw = buf.subarray(start, start + compSize)
    let data: Buffer
    if (method === 0) data = raw
    else if (method === 8) data = inflateRawSync(raw)
    else throw new Error(`método de compressão ${method} não suportado: ${path}`)
    if (data.length !== size) throw new Error(`zip corrompido: tamanho de ${path}`)
    out.push({ path, data: new Uint8Array(data) })
  }
  return out
}
