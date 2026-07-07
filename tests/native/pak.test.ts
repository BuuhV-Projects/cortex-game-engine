/**
 * Round-trip do container .pak (ADR-0104): empacota uma pasta e lê de volta
 * espelhando o que o host C++ (native/src/shims/pak.cpp) faz — mesmo header,
 * mesmo XOR, mesmo índice binário. Se este teste passar, o formato é
 * auto-consistente e o reader nativo (que segue as MESMAS regras) resolve.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packDir, PAK_KEY } from '../../native/scripts/pak.mjs';

const HEADER = 16;

/** Desembaralha (mesma regra do writer/reader): pos absoluta, header cru. */
function unscramble(buf: Buffer, filePos: number): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i < out.length; i++) {
    out[i] ^= PAK_KEY[(filePos + i - HEADER) % PAK_KEY.length];
  }
  return out;
}

/** Lê o pak e devolve um mapa chave → conteúdo (espelha pak.cpp). */
function readPak(pakFile: string): Map<string, Buffer> {
  const raw = fs.readFileSync(pakFile);
  expect(raw.subarray(0, 4).toString('ascii')).toBe('CXP1');
  const indexOffset = raw.readUInt32LE(4);
  const indexSize = raw.readUInt32LE(8);
  const scrambled = (raw.readUInt32LE(12) & 1) !== 0;

  let idx = raw.subarray(indexOffset, indexOffset + indexSize);
  if (scrambled) idx = unscramble(idx, indexOffset);

  const files = new Map<string, Buffer>();
  const count = idx.readUInt32LE(0);
  let pos = 4;
  for (let i = 0; i < count; i++) {
    const pathLen = idx.readUInt16LE(pos);
    pos += 2;
    const key = idx.subarray(pos, pos + pathLen).toString('utf8');
    pos += pathLen;
    const offset = idx.readUInt32LE(pos);
    pos += 4;
    const size = idx.readUInt32LE(pos);
    pos += 4;
    const filePos = HEADER + offset;
    let data = raw.subarray(filePos, filePos + size);
    if (scrambled) data = unscramble(data, filePos);
    files.set(key, data);
  }
  return files;
}

describe('pak (container de assets, ADR-0104)', () => {
  let dir: string;
  let out: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pak-test-'));
    fs.mkdirSync(path.join(dir, 'kit'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'conteúdo A áçã');
    fs.writeFileSync(path.join(dir, 'kit', 'bee.glb'), Buffer.from([0, 1, 2, 3, 255, 254, 0, 0]));
    fs.writeFileSync(path.join(dir, 'kit', 'vazio.bin'), Buffer.alloc(0));
    out = path.join(dir, 'assets.pak');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('empacota com prefixo e devolve os arquivos íntegros na leitura', () => {
    const r = packDir(dir, out, 'assets/');
    // 3 arquivos (a.txt, kit/bee.glb, kit/vazio.bin) — o assets.pak não se conta
    // porque é criado DEPOIS do walk.
    expect(r.files).toBe(3);

    const files = readPak(out);
    expect(files.get('assets/a.txt')?.toString('utf8')).toBe('conteúdo A áçã');
    expect([...(files.get('assets/kit/bee.glb') ?? [])]).toEqual([0, 1, 2, 3, 255, 254, 0, 0]);
    expect(files.get('assets/kit/vazio.bin')?.length).toBe(0);
  });

  it('o conteúdo cru do pak NÃO contém os bytes originais (embaralhado)', () => {
    packDir(dir, out, 'assets/');
    const raw = fs.readFileSync(out);
    // A string original não aparece crua no arquivo (XOR aplicado).
    expect(raw.includes(Buffer.from('conteúdo A', 'utf8'))).toBe(false);
    // Nem a chave do índice.
    expect(raw.includes(Buffer.from('assets/kit/bee.glb', 'utf8'))).toBe(false);
  });
});
