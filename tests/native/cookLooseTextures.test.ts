/**
 * Cook das imagens soltas por lista do jogo (SPEC-0755, ADR-0756): o glob da
 * lista, o `exclude`, a primeira entrada vencendo, a entrada que não casa
 * avisando, a fonte fora dos blocos 4×4 e a falha ficando com o original, o
 * `replace`, o manifesto e o cache. O encoder é mockado (o encode real está no
 * `encode-ktx2-flip.test.ts`); o mock ainda passa pelo `planEncode` real, que lê
 * o header e reprova a fonte fora de 4×4.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import sharp from 'sharp';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { planEncode } from '../../native/scripts/encode-ktx2.mjs';

const encodeKtx2 = vi.hoisted(() => vi.fn());
vi.mock('../../native/scripts/encode-ktx2.mjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encodeKtx2,
}));

// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
const { cookAssets } = await import('../../native/scripts/cook-assets.mjs');
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
const textures = await import('../../native/scripts/cook-textures.mjs');
const { cookTexturesOf, globToRegExp, planCookTextures, resetCookTexturesWarnings } = textures;

const FAKE_KTX2 = new Uint8Array([0xab, 0x4b, 0x54, 0x58]);
const RGB = 3;

async function png(file: string, width = 8, height = 8): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  const raw = Buffer.alloc(width * height * RGB, 120);
  writeFileSync(file, await sharp(raw, { raw: { width, height, channels: RGB } }).png().toBuffer());
}

let root: string;
let assets: string;
let out: string;
let cache: string;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cortex-cook-loose-'));
  assets = join(root, 'assets');
  out = join(root, 'out');
  cache = join(root, 'cache');
  encodeKtx2.mockReset();
  encodeKtx2.mockImplementation(async (bytes: Uint8Array) => {
    planEncode(bytes);
    return FAKE_KTX2;
  });
  resetCookTexturesWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  rmSync(root, { recursive: true, force: true });
});

const cook = (list: unknown) => cookAssets(assets, out, cache, undefined, undefined, { cookTextures: cookTexturesOf(list) });
const manifest = () => JSON.parse(readFileSync(join(out, 'cooked-textures.json'), 'utf8'));

describe('cookTextures — a lista', () => {
  it('glob: * fica numa pasta, ** entra nas subpastas, ? é um caractere', () => {
    expect(globToRegExp('assets/paint/*.png').test('assets/paint/a.png')).toBe(true);
    expect(globToRegExp('assets/paint/*.png').test('assets/paint/sub/a.png')).toBe(false);
    expect(globToRegExp('assets/**/*.png').test('assets/paint/sub/a.png')).toBe(true);
    expect(globToRegExp('assets/**/*.png').test('assets/a.png')).toBe(true);
    expect(globToRegExp('assets/**').test('assets/x/y.jpg')).toBe(true);
    expect(globToRegExp('assets/p?.png').test('assets/p1.png')).toBe(true);
    expect(globToRegExp('assets/a.png').test('assets/aXpng')).toBe(false);
  });

  it('padrões: o exclude tira do conjunto e a primeira entrada vence', () => {
    const list = cookTexturesOf([
      { files: ['assets/paint/*.png'], exclude: 'assets/paint/normal_*.png', srgb: true },
      { files: 'assets/**/*.png', srgb: false, flipY: true },
    ]);
    const { byFile, unmatched } = planCookTextures(list, ['paint/red.png', 'paint/normal_a.png', 'sky/day.png']);
    expect(byFile.get('paint/red.png').srgb).toBe(true);
    expect(byFile.get('paint/normal_a.png').srgb).toBe(false); // excluído da 1ª, cai na 2ª
    expect(byFile.get('sky/day.png').flipY).toBe(true);
    expect(unmatched).toEqual([]);
  });

  it('padrões: só imagem entra (o .glb segue no cook dele), sem diferenciar maiúsculas e sem a barra na frente', () => {
    const list = cookTexturesOf([{ files: '/assets/vehicles/**' }]);
    const { byFile } = planCookTextures(list, ['vehicles/car.glb', 'vehicles/car.json', 'vehicles/paint/Red.PNG', 'vehicles/paint/b.jpeg']);
    expect([...byFile.keys()].sort()).toEqual(['vehicles/paint/Red.PNG', 'vehicles/paint/b.jpeg']);
    expect(planCookTextures(cookTexturesOf([{ files: 'assets/sky/*.png' }]), ['sky/Day.PNG']).byFile.size).toBe(1);
  });

  it('padrões padrão: srgb true, flipY true (como o loadTexture), replace true; sem a lista, nada', () => {
    const [entry] = cookTexturesOf([{ files: './assets/a.png' }]);
    expect(entry).toMatchObject({ files: ['assets/a.png'], exclude: [], srgb: true, flipY: true, replace: true });
    expect(cookTexturesOf(undefined)).toEqual([]);
  });

  it('entrada inválida reprova com o índice', () => {
    expect(() => cookTexturesOf({})).toThrow(/lista/);
    expect(() => cookTexturesOf([{ srgb: true }])).toThrow(/cookTextures\[0\].*files/);
    expect(() => cookTexturesOf([{ files: 'a.png', flipY: 'sim' }])).toThrow(/flipY/);
    expect(() => cookTexturesOf([{ files: [''] }])).toThrow(/vazio/);
  });
});

describe('cookAssets — imagens soltas', () => {
  it('converte o que a lista casa, grava o .ktx2 ao lado e o manifesto', async () => {
    await png(join(assets, 'paint', 'red.png'));
    await png(join(assets, 'ui', 'logo.png'));

    const stats = await cook([{ files: 'assets/paint/*.png' }]);

    expect(readFileSync(join(out, 'paint', 'red.png.ktx2'))).toEqual(Buffer.from(FAKE_KTX2));
    expect(existsSync(join(out, 'paint', 'red.png'))).toBe(false); // replace: só o .ktx2
    expect(existsSync(join(out, 'ui', 'logo.png'))).toBe(true); // fora da lista: copiado
    expect(manifest()).toEqual({ 'assets/paint/red.png': 'assets/paint/red.png.ktx2' });
    expect(stats).toMatchObject({ looseConverted: 1, looseCached: 0, looseKept: 0, copied: 1 });
  });

  it('passa srgb e flipY da entrada ao encode (dado: linear sem RDO)', async () => {
    await png(join(assets, 'sky', 'day.png'));
    await png(join(assets, 'fx', 'ripple.png'));

    await cook([{ files: 'assets/sky/*.png', flipY: false }, { files: 'assets/fx/*.png', srgb: false }]);

    const opts = encodeKtx2.mock.calls.map((c) => c[1]);
    expect(opts).toContainEqual({ uastc: true, srgb: true, rdoScalar: 1, flipY: false });
    expect(opts).toContainEqual({ uastc: true, srgb: false, rdoScalar: 0, flipY: true });
  });

  it('replace: false mantém o original no pak junto do .ktx2', async () => {
    await png(join(assets, 'fx', 'ripple.png'));

    await cook([{ files: 'assets/fx/ripple.png', replace: false }]);

    expect(existsSync(join(out, 'fx', 'ripple.png'))).toBe(true);
    expect(existsSync(join(out, 'fx', 'ripple.png.ktx2'))).toBe(true);
  });

  it('fonte fora dos blocos 4×4 fica com o original, avisa e conta o motivo', async () => {
    await png(join(assets, 'odd.png'), 6, 8);

    const stats = await cook([{ files: 'assets/*.png' }]);

    expect(existsSync(join(out, 'odd.png'))).toBe(true);
    expect(existsSync(join(out, 'odd.png.ktx2'))).toBe(false);
    expect(existsSync(join(out, 'cooked-textures.json'))).toBe(false); // nada converteu
    expect(stats.looseKeptReasons).toEqual({ ERR_NOT_BLOCK_ALIGNED: 1 });
    expect(warn.mock.calls.flat().join('\n')).toMatch(/odd\.png.*4×4.*mantém o original/);
  });

  it('falha do encode fica com o original e não entra no cache', async () => {
    await png(join(assets, 'a.png'));
    encodeKtx2.mockRejectedValue(Object.assign(new Error('basis recusou'), { code: 'ERR_ENCODE_FAILED' }));

    const stats = await cook([{ files: 'assets/a.png' }]);

    expect(existsSync(join(out, 'a.png'))).toBe(true);
    expect(stats.looseKeptReasons).toEqual({ ERR_ENCODE_FAILED: 1 });
    expect(readdirSync(cache)).toEqual([]);
  });

  it('entrada que não casa nada avisa no log', async () => {
    await png(join(assets, 'a.png'));

    await cook([{ files: 'assets/nada/*.png' }]);

    expect(warn.mock.calls.flat().join('\n')).toMatch(/assets\/nada\/\*\.png.*não casou/);
  });

  it('cache: o segundo export não reencoda; mudar flipY reencoda', async () => {
    await png(join(assets, 'a.png'));
    await cook([{ files: 'assets/a.png' }]);
    rmSync(out, { recursive: true, force: true });

    const again = await cook([{ files: 'assets/a.png' }]);
    expect(again).toMatchObject({ looseConverted: 0, looseCached: 1 });
    expect(existsSync(join(out, 'a.png.ktx2'))).toBe(true);
    expect(encodeKtx2).toHaveBeenCalledTimes(1);

    const flipped = await cook([{ files: 'assets/a.png', flipY: false }]);
    expect(flipped).toMatchObject({ looseConverted: 1, looseCached: 0 });
    expect(encodeKtx2).toHaveBeenCalledTimes(2);
  });

  it('sem a lista, o cook copia as imagens como antes e não grava manifesto', async () => {
    await png(join(assets, 'a.png'));

    const stats = await cookAssets(assets, out, cache);

    expect(existsSync(join(out, 'a.png'))).toBe(true);
    expect(existsSync(join(out, 'cooked-textures.json'))).toBe(false);
    expect(encodeKtx2).not.toHaveBeenCalled();
    expect(stats.copied).toBe(1);
  });
});
