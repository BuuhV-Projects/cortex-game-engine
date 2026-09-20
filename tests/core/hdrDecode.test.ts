/**
 * Decodificador de `.hdr` próprio (SPEC-0217): o contrato é ser **idêntico** ao
 * `HDRLoader` do three, só que sem `Math.pow`/`toHalfFloat` por pixel. Os testes
 * geram arquivos Radiance sintéticos (RLE com literais, RLE com repetições
 * longas, scanline crua) e comparam a saída half-float valor a valor.
 */
import { describe, it, expect } from 'vitest';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { decodeHdr } from '../../src/core/hdrDecode.js';

/** Gerador determinístico — o mesmo arquivo em toda rodada. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Monta o cabeçalho Radiance de uma imagem `width`×`height`. */
function header(width: number, height: number): number[] {
  const text = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  return [...text].map((c) => c.charCodeAt(0));
}

/** Arquivo com scanlines CRUAS (o que o formato usa quando width < 8). */
function rawHdr(width: number, height: number, rgbe: Uint8Array): ArrayBuffer {
  return new Uint8Array([...header(width, height), ...rgbe]).buffer;
}

/** Arquivo com scanlines RLE adaptativas (o caso comum dos HDRIs reais). */
function rleHdr(width: number, height: number, rgbe: Uint8Array): ArrayBuffer {
  const out: number[] = header(width, height);
  for (let y = 0; y < height; y++) {
    out.push(2, 2, (width >> 8) & 0xff, width & 0xff);
    for (let channel = 0; channel < 4; channel++) {
      // canal planar da linha
      const line: number[] = [];
      for (let x = 0; x < width; x++) line.push(rgbe[(y * width + x) * 4 + channel]!);
      let i = 0;
      while (i < width) {
        let run = 1;
        while (i + run < width && rgbe[(y * width + i) * 4 + channel] === line[i + run] && run < 127) run++;
        if (run >= 4) {
          out.push(128 + run, line[i]!); // repetição
          i += run;
        } else {
          let literal = 1;
          while (i + literal < width && literal < 128 && !(literal >= 2 && line[i + literal] === line[i + literal - 1])) {
            literal++;
          }
          out.push(literal);
          for (let k = 0; k < literal; k++) out.push(line[i + k]!);
          i += literal;
        }
      }
    }
  }
  return new Uint8Array(out).buffer;
}

/** O que o three produz para o mesmo arquivo (half-float, o default). */
function threeDecode(buffer: ArrayBuffer): { width: number; height: number; data: Uint16Array } {
  const parsed = new HDRLoader().parse(buffer) as unknown as {
    width: number; height: number; data: Uint16Array;
  };
  return parsed;
}

function expectSameAsThree(buffer: ArrayBuffer): void {
  const meu = decodeHdr(buffer);
  const three = threeDecode(buffer);
  expect(meu.width).toBe(three.width);
  expect(meu.height).toBe(three.height);
  expect(meu.data.length).toBe(three.data.length);
  for (let i = 0; i < three.data.length; i++) {
    if (meu.data[i] !== three.data[i]) {
      throw new Error(`divergiu no índice ${i}: meu=${meu.data[i]} three=${three.data[i]}`);
    }
  }
}

describe('decodeHdr', () => {
  it('bate com o three em scanline RLE de pixels variados', () => {
    const width = 64;
    const height = 8;
    const random = makeRandom(7);
    const rgbe = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgbe.length; i += 4) {
      rgbe[i] = Math.floor(random() * 256);
      rgbe[i + 1] = Math.floor(random() * 256);
      rgbe[i + 2] = Math.floor(random() * 256);
      rgbe[i + 3] = 100 + Math.floor(random() * 50); // expoentes plausíveis de céu
    }
    expectSameAsThree(rleHdr(width, height, rgbe));
  });

  it('bate com o three em repetições longas (runs de RLE)', () => {
    const width = 100;
    const height = 4;
    const rgbe = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        rgbe[i] = 200; // mesma cor na linha inteira: vira um run só
        rgbe[i + 1] = 180;
        rgbe[i + 2] = 160;
        rgbe[i + 3] = 128 + y;
      }
    }
    expectSameAsThree(rleHdr(width, height, rgbe));
  });

  it('bate com o three em scanline CRUA (width < 8)', () => {
    const width = 4;
    const height = 3;
    const random = makeRandom(11);
    const rgbe = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgbe.length; i++) rgbe[i] = Math.floor(random() * 256);
    expectSameAsThree(rawHdr(width, height, rgbe));
  });

  it('bate com o three nos extremos: expoente 0 (preto) e expoente alto (clamp)', () => {
    const width = 8;
    const height = 2;
    const rgbe = new Uint8Array(width * height * 4);
    for (let x = 0; x < width; x++) {
      const preto = x * 4;
      rgbe[preto] = 255; rgbe[preto + 1] = 255; rgbe[preto + 2] = 255; rgbe[preto + 3] = 0;
      const estouro = (width + x) * 4;
      rgbe[estouro] = 255; rgbe[estouro + 1] = 255; rgbe[estouro + 2] = 255; rgbe[estouro + 3] = 200;
    }
    expectSameAsThree(rleHdr(width, height, rgbe));
  });

  it('alfa é sempre 1.0 em half-float', () => {
    const width = 8;
    const height = 1;
    const rgbe = new Uint8Array(width * height * 4).fill(120);
    const { data } = decodeHdr(rleHdr(width, height, rgbe));
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(0x3c00);
  });

  it('recusa arquivo que não é Radiance', () => {
    const naoEhHdr = new Uint8Array([...'PNG\r\n\n'].map((c) => c.charCodeAt(0))).buffer;
    expect(() => decodeHdr(naoEhHdr)).toThrow(/Radiance/);
  });

  it('recusa arquivo sem linha de resolução', () => {
    const semResolucao = new Uint8Array([...'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n'].map((c) => c.charCodeAt(0))).buffer;
    expect(() => decodeHdr(semResolucao)).toThrow(/resolução/);
  });
});
