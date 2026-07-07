// Empacotador de assets ".pak" do CortexNative (ADR-0104).
//
// Junta uma pasta de assets num arquivo ÚNICO com índice + um XOR leve — pra o
// export não ficar com centenas de arquivos soltos que qualquer um abre. NÃO é
// criptografia de verdade (a chave vai no binário; a GPU vê o dado cru): é uma
// barreira contra extração casual, o padrão da indústria (Unity/Unreal packs).
// O host (native/src/shims/pak.cpp) lê deste formato — mantenha os dois em sync.
//
// Formato (little-endian):
//   [0]  magic "CXP1" (4 bytes)
//   [4]  indexOffset (u32) — início do índice
//   [8]  indexSize   (u32) — bytes do índice
//   [12] flags       (u32) — bit0 = XOR aplicado
//   [16] blob de dados (arquivos concatenados)
//   [indexOffset] índice: [count u32] então count× [pathLen u16][path utf8][offset u32][size u32]
// XOR: todo byte de 16..EOF é `raw ^ KEY[(pos-16) % KEY.length]` (header fica cru).
// Limite: 4 GB por pak/arquivo (offsets u32) — folgado pra um jogo.
import fs from 'node:fs';
import path from 'node:path';

const MAGIC = Buffer.from('CXP1', 'ascii');
// Chave do XOR — 32 bytes. DEVE bater com KEY em native/src/shims/pak.cpp.
export const PAK_KEY = Buffer.from('CortexNative-pak-scramble-key-v1', 'ascii');
const FLAG_SCRAMBLED = 1;
const HEADER = 16;

/** XOR in-place; `filePos` = posição absoluta de buf[0] no arquivo (>=16). */
function scramble(buf, filePos) {
  for (let i = 0; i < buf.length; i++) {
    buf[i] ^= PAK_KEY[(filePos + i - HEADER) % PAK_KEY.length];
  }
}

/** Lista recursiva de arquivos com a chave (path relativo, barras '/'). */
function walk(dir, prefix) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const key = prefix + entry.name;
    if (entry.isDirectory()) out.push(...walk(abs, key + '/'));
    else if (entry.isFile()) out.push({ key, abs });
  }
  return out;
}

/**
 * Empacota `srcDir` em `outFile`. `prefix` vai na frente das chaves (ex.:
 * 'assets/' → o jogo pede `assets/kit/bee.glb`). Devolve {files, bytes}.
 */
export function packDir(srcDir, outFile, prefix = '') {
  const files = walk(srcDir, prefix);

  const chunks = [];
  const index = [];
  let offset = 0;
  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    index.push({ key: f.key, offset, size: data.length });
    chunks.push(data);
    offset += data.length;
  }
  const blob = Buffer.concat(chunks);

  // Índice binário: count + entradas.
  const parts = [];
  const count = Buffer.alloc(4);
  count.writeUInt32LE(index.length, 0);
  parts.push(count);
  for (const e of index) {
    const key = Buffer.from(e.key, 'utf8');
    const pathLen = Buffer.alloc(2);
    pathLen.writeUInt16LE(key.length, 0);
    const nums = Buffer.alloc(8);
    nums.writeUInt32LE(e.offset, 0);
    nums.writeUInt32LE(e.size, 4);
    parts.push(pathLen, key, nums);
  }
  const indexBuf = Buffer.concat(parts);

  const indexOffset = HEADER + blob.length;
  scramble(blob, HEADER);
  scramble(indexBuf, indexOffset);

  const header = Buffer.alloc(HEADER);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(indexOffset, 4);
  header.writeUInt32LE(indexBuf.length, 8);
  header.writeUInt32LE(FLAG_SCRAMBLED, 12);

  fs.writeFileSync(outFile, Buffer.concat([header, blob, indexBuf]));
  return { files: files.length, bytes: indexOffset + indexBuf.length };
}
