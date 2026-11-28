/**
 * A lista `cookTextures` do `cortex.json` (SPEC-0755, ADR-0756): o glob, o `exclude`, a primeira entrada vencendo, só
 * imagem entrando, os valores padrão e a entrada inválida. Funções puras, sem cook nem encode (esses estão no
 * `cookLooseTextures.test.ts`).
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { cookTexturesOf, globToRegExp, planCookTextures } from '../../native/scripts/cook-textures.mjs';

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
