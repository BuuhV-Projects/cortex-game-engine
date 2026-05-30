/**
 * Geração de ícones placeholder para o bundle Tauri (ADR-0024).
 *
 * O `tauri build` exige `src-tauri/icons/{32x32,128x128,128x128@2x}.png`
 * e `icon.ico`. Pedir pro usuário rodar `yarn tauri icon <png>` antes
 * de cada build era atrito sem retorno — pra primeira validação, gerar
 * automaticamente um placeholder cinza-azulado destrava o fluxo. O
 * usuário pode substituir os arquivos a qualquer momento; o gerador
 * pula geração se `icon.ico` já existe.
 *
 * Sem dependências externas: PNG sólido construído via `zlib.deflateSync`
 * + `zlib.crc32`, ambos nativos do Node 18+. ICO usa formato PNG-in-ICO
 * (válido em Windows Vista+).
 */

import { writeFile, mkdir, access } from 'fs/promises'
import { join } from 'path'
import { deflateSync, crc32 } from 'zlib'

/** Cor placeholder cinza-azulada — neutra, sinaliza "ainda não personalizado". */
const PLACEHOLDER_RGB: [number, number, number] = [74, 95, 122]

/**
 * Gera PNGs e ICO placeholder em `<tauriDir>/icons/`. Idempotente:
 * se `icon.ico` já existe, não faz nada. Retorna `true` se gerou,
 * `false` se pulou.
 */
export async function writePlaceholderIcons(tauriDir: string): Promise<boolean> {
  const iconsDir = join(tauriDir, 'icons')

  // Skip se .ico já existe (usuário pode ter rodado `tauri icon` manualmente).
  try {
    await access(join(iconsDir, 'icon.ico'))
    return false
  } catch {
    // não existe — segue
  }

  await mkdir(iconsDir, { recursive: true })

  const png32 = makeSolidPng(32, PLACEHOLDER_RGB)
  const png128 = makeSolidPng(128, PLACEHOLDER_RGB)
  const png256 = makeSolidPng(256, PLACEHOLDER_RGB)

  await Promise.all([
    writeFile(join(iconsDir, '32x32.png'), png32),
    writeFile(join(iconsDir, '128x128.png'), png128),
    writeFile(join(iconsDir, '128x128@2x.png'), png256),
    writeFile(join(iconsDir, 'icon.ico'), makeIcoFromPng(png256, 256)),
  ])

  return true
}

// ─── PNG sólido ──────────────────────────────────────────────────────────────

/**
 * Constrói um PNG `size`×`size` preenchido com `[r, g, b]`. PNG truecolor
 * (color type 2, 8 bits por canal), sem filtros (todos scanlines com
 * filter byte = 0).
 */
function makeSolidPng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter method: adaptive
  ihdr[12] = 0 // interlace: none

  const scanline = 1 + size * 3
  const raw = Buffer.alloc(scanline * size)
  for (let y = 0; y < size; y++) {
    const off = y * scanline
    raw[off] = 0 // filter byte: None
    for (let x = 0; x < size; x++) {
      const px = off + 1 + x * 3
      raw[px] = r
      raw[px + 1] = g
      raw[px + 2] = b
    }
  }

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', deflateSync(raw)),
    makePngChunk('IEND', Buffer.alloc(0)),
  ])
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

// ─── ICO (PNG embutido) ──────────────────────────────────────────────────────

/**
 * Constrói um .ico com uma única imagem embutida em formato PNG.
 * Suportado a partir do Windows Vista. `size` é só o valor declarado
 * no ICONDIRENTRY (zero significa 256+); o PNG mantém suas próprias
 * dimensões reais.
 */
function makeIcoFromPng(png: Buffer, size: number): Buffer {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type: 1 = icon
  dir.writeUInt16LE(1, 4) // image count

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size // width (0 representa 256)
  entry[1] = size >= 256 ? 0 : size // height
  entry[2] = 0 // colors in palette (0 = sem palette / >256)
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8) // image size
  entry.writeUInt32LE(6 + 16, 12) // offset to image data (after dir+entry)

  return Buffer.concat([dir, entry, png])
}
