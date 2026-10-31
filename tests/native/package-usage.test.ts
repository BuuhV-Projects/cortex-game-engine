/**
 * Export leva só os materiais de pacote que o jogo cita (SPEC-0641 §6).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { usedPackageMaterials, packageAssetFilter } from '../../native/scripts/package-usage.mjs';
// @ts-expect-error — idem
import { cookAssets } from '../../native/scripts/cook-assets.mjs';

let game: string;
const put = (rel: string, text = 'x'): void => {
  const f = join(game, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text);
};

beforeEach(() => {
  game = mkdtempSync(join(tmpdir(), 'cortex-game-'));
  for (const m of ['grass01', 'clay', 'salt']) {
    put(`assets/packages/cortex-yughues-ground-textures/materials/${m}/color.jpg`);
    put(`assets/packages/cortex-yughues-ground-textures/materials/${m}/normal.png`);
  }
  put('assets/packages/cortex-yughues-ground-textures/cortex-package.json', '{}');
  put('assets/textures/grass.png');
  // a cena cita a COR do grass01; o código cita o clay; salt não aparece em lugar nenhum
  put('scenes/fase1.json', JSON.stringify({ terrainPaint: { t: { layers: [{ url: 'assets/packages/cortex-yughues-ground-textures/materials/grass01/color.jpg' }] } } }));
  put('src/main.ts', "const t = '/assets/packages/cortex-yughues-ground-textures/materials/clay/color.jpg';");
  // citação dentro de node_modules/vendor não conta
  put('node_modules/x/index.js', "'packages/cortex-yughues-ground-textures/materials/salt/color.jpg'");
});
afterEach(() => rmSync(game, { recursive: true, force: true }));

describe('package-usage', () => {
  it('acha os materiais citados por cena e código, ignorando node_modules', () => {
    expect([...usedPackageMaterials(game)].sort()).toEqual([
      'cortex-yughues-ground-textures/clay',
      'cortex-yughues-ground-textures/grass01',
    ]);
  });

  it('filtro: material inteiro entra, resto do pacote fica fora, asset solto sempre entra', () => {
    const inc = packageAssetFilter(usedPackageMaterials(game));
    expect(inc('packages\\cortex-yughues-ground-textures\\materials\\grass01\\normal.png')).toBe(true);
    expect(inc('packages/cortex-yughues-ground-textures/materials/salt/color.jpg')).toBe(false);
    expect(inc('packages/cortex-yughues-ground-textures/cortex-package.json')).toBe(false);
    expect(inc('textures/grass.png')).toBe(true);
  });

  it('cookAssets com o filtro copia só o usado', async () => {
    const out = join(game, 'cooked');
    const stats = await cookAssets(join(game, 'assets'), out, join(game, '.cache'), undefined,
      packageAssetFilter(usedPackageMaterials(game)));
    const pkg = join(out, 'packages/cortex-yughues-ground-textures');
    expect(existsSync(join(pkg, 'materials/grass01/normal.png'))).toBe(true);
    expect(existsSync(join(pkg, 'materials/clay/color.jpg'))).toBe(true);
    expect(existsSync(join(pkg, 'materials/salt'))).toBe(false);
    expect(existsSync(join(out, 'textures/grass.png'))).toBe(true);
    expect(stats.skipped).toBe(3); // salt (2) + manifesto
  });
});
