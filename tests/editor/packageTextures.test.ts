/**
 * Materiais de pacote de textura no seletor do editor (SPEC-0641 §5).
 */
import { describe, it, expect } from 'vitest';
import { isPackageAsset, loadPackageTextureItems } from '../../src/editor/packageTextures.js';

const manifest = {
  schema: 1, id: 'cortex-yughues-ground-textures', kind: 'textures', name: 'Ground', version: '1.0.0',
  license: { spdx: 'LicenseRef-Unity-Asset-Store-EULA', redistributable: false },
  materials: [
    { id: 'grass01', name: 'Grass 01', size: 1024, maps: { color: 'materials/grass01/color.jpg', normal: 'materials/grass01/normal.png' } },
    { id: 'snow', name: 'Snow', size: 1024, maps: { normal: 'materials/snow/normal.png' }, incomplete: true },
  ],
};

describe('packageTextures', () => {
  it('reconhece arquivo de pacote', () => {
    expect(isPackageAsset('assets/packages/x/materials/a/color.jpg')).toBe(true);
    expect(isPackageAsset('assets/textures/grass.png')).toBe(false);
  });

  it('um item por material completo, nome com o pacote, valor = URL da cor', async () => {
    const assets = [
      'assets/textures/grass.png',
      'assets/packages/cortex-yughues-ground-textures/cortex-package.json',
      'assets/packages/cortex-yughues-ground-textures/materials/grass01/color.jpg',
    ];
    const items = await loadPackageTextureItems(assets, async () => manifest);
    expect(items).toEqual([
      {
        name: 'Ground · Grass 01',
        thumb: 'assets/packages/cortex-yughues-ground-textures/materials/grass01/color.jpg',
        value: 'assets/packages/cortex-yughues-ground-textures/materials/grass01/color.jpg',
      },
    ]);
  });

  it('manifesto quebrado é ignorado sem esconder os outros', async () => {
    const assets = ['assets/packages/a/cortex-package.json', 'assets/packages/b/cortex-package.json'];
    const items = await loadPackageTextureItems(assets, async (url) => {
      if (url.includes('/a/')) throw new Error('404');
      return manifest;
    });
    expect(items).toHaveLength(1);
  });
});
