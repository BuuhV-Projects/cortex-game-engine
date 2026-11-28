/**
 * O `flipY` do encode (SPEC-0755): a imagem solta que o jogo usa com
 * `flipY = true` sai do cook com as linhas viradas, porque textura comprimida
 * ignora o flipY no upload. Encode REAL de um PNG 8×8 (metade de cima vermelha,
 * de baixo azul) pelo WASM (`setYFlip`) e pelo basisu nativo (`-y_flip`), lido de
 * volta pelo `KTX2File` do módulo basis transcodado para RGBA32.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  encodeKtx2,
  getModule,
  hasEncoder,
  // @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
} from '../../native/scripts/encode-ktx2.mjs';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { basisuArgs, encodeKtx2Native, hasNativeEncoder } from '../../native/scripts/encode-ktx2-native.mjs';

const SIDE = 8;
const RGB = 3;
const RGBA = 4;
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const COLOR = { uastc: true, srgb: true, quality: 128, rdoScalar: 1 };

/** PNG 8×8: as 4 linhas de cima vermelhas, as de baixo azuis. */
async function topRedPng(): Promise<Uint8Array> {
  const raw = Buffer.alloc(SIDE * SIDE * RGB);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) raw[(y * SIDE + x) * RGB + (y < SIDE / 2 ? 0 : 2)] = 255;
  }
  return new Uint8Array(await sharp(raw, { raw: { width: SIDE, height: SIDE, channels: RGB } }).png().toBuffer());
}

/** Primeiro e último texel do nível 0 do KTX2 em RGBA32 (a primeira linha é a de cima). */
async function firstAndLast(ktx2: Uint8Array): Promise<[number[], number[]]> {
  const M = await getModule();
  const file = new M.KTX2File(ktx2);
  try {
    expect(file.isValid()).toBeTruthy();
    expect(file.startTranscoding()).toBeTruthy();
    const format = M.transcoder_texture_format.cTFRGBA32.value;
    const out = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, format));
    expect(file.transcodeImage(out, 0, 0, 0, format, 0, -1, -1)).toBeTruthy();
    return [Array.from(out.slice(0, RGBA)), Array.from(out.slice(out.length - RGBA))];
  } finally {
    file.close();
    file.delete();
  }
}

describe('basisuArgs — flipY', () => {
  it('-y_flip só com flipY', () => {
    expect(basisuArgs({ ...COLOR, flipY: true }, 'in.png', 'out.ktx2')).toContain('-y_flip');
    expect(basisuArgs(COLOR, 'in.png', 'out.ktx2')).not.toContain('-y_flip');
  });
});

describe.runIf(hasEncoder())('encodeKtx2 — flipY pelo WASM', () => {
  it('sem flipY a linha de cima segue vermelha; com flipY vira azul', async () => {
    const src = await topRedPng();
    expect(await firstAndLast(await encodeKtx2(src))).toEqual([RED, BLUE]);
    expect(await firstAndLast(await encodeKtx2(src, { flipY: true }))).toEqual([BLUE, RED]);
  });
});

describe.runIf(hasEncoder() && hasNativeEncoder())('encodeKtx2Native — flipY pelo basisu', () => {
  it('sem flipY a linha de cima segue vermelha; com flipY vira azul', async () => {
    const src = await topRedPng();
    expect(await firstAndLast(await encodeKtx2Native(src, 'png', COLOR))).toEqual([RED, BLUE]);
    expect(await firstAndLast(await encodeKtx2Native(src, 'png', { ...COLOR, flipY: true }))).toEqual([BLUE, RED]);
  });
});
