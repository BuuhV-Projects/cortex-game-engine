/**
 * Cache do cook quando falta o basisu nativo (SPEC-0750): a textura acima do teto
 * do WASM fica com o original, e o GLB NÃO entra no cache — senão o export
 * seguinte, já com o exe compilado, reusaria o GLB sem KTX2. Outra falha da
 * textura (formato, encode) é da textura, e o GLB cacheia normalmente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { ERR_ENCODE_FAILED, ERR_NATIVE_ENCODER_FAILED, ERR_NATIVE_ENCODER_MISSING } from '../../native/scripts/encode-ktx2.mjs';

const encodeKtx2 = vi.hoisted(() => vi.fn());
vi.mock('../../native/scripts/encode-ktx2.mjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encodeKtx2,
}));

// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
const { cookAssets } = await import('../../native/scripts/cook-assets.mjs');

const TEX_DIM = 128;
const RGB = 3;

async function writeGlb(file: string): Promise<void> {
  const doc = new Document();
  doc.createBuffer();
  const png = await sharp(Buffer.alloc(TEX_DIM * TEX_DIM * RGB, 90), {
    raw: { width: TEX_DIM, height: TEX_DIM, channels: RGB },
  })
    .png()
    .toBuffer();
  doc.createTexture('tex').setImage(new Uint8Array(png)).setMimeType('image/png');
  writeFileSync(file, await new NodeIO().writeBinary(doc));
}

let root: string;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cortex-cook-native-'));
  await writeGlb(join(root, 'npc.glb'));
  encodeKtx2.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  rmSync(root, { recursive: true, force: true });
});

const fail = (code: string) => Object.assign(new Error(code), { code });

describe('cookAssets — basisu nativo ausente', () => {
  it('mantém a textura, conta o motivo e não cacheia o GLB', async () => {
    encodeKtx2.mockRejectedValue(fail(ERR_NATIVE_ENCODER_MISSING));
    const cache = join(root, 'cache');

    const stats = await cookAssets(root, join(root, 'out'), cache);

    expect(stats.texKept).toBe(1);
    expect(stats.texKeptReasons).toEqual({ [ERR_NATIVE_ENCODER_MISSING]: 1 });
    expect(stats).not.toHaveProperty('texReduced');
    expect(readdirSync(cache)).toEqual([]);
  });

  it('basisu que não roda (DLL, timeout) também não cacheia o GLB', async () => {
    encodeKtx2.mockRejectedValue(fail(ERR_NATIVE_ENCODER_FAILED));
    const cache = join(root, 'cache');

    const stats = await cookAssets(root, join(root, 'out'), cache);

    expect(stats.texKeptReasons).toEqual({ [ERR_NATIVE_ENCODER_FAILED]: 1 });
    expect(readdirSync(cache)).toEqual([]);
  });

  it('falha da própria textura cacheia o GLB como antes', async () => {
    encodeKtx2.mockRejectedValue(fail(ERR_ENCODE_FAILED));
    const cache = join(root, 'cache');

    await cookAssets(root, join(root, 'out'), cache);

    expect(readdirSync(cache)).toHaveLength(1);
  });
});
