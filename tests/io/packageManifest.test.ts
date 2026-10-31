/**
 * Manifesto de pacote de textura (SPEC-0641): validação e itens do seletor.
 */
import { describe, it, expect } from 'vitest';
import { parsePackageManifest, packageMaterialPicks } from '../../src/io/packages/manifest.js';

const base = () => ({
  schema: 1,
  id: 'cortex-yughues-ground-textures',
  kind: 'textures',
  name: 'Yughues — Ground',
  version: '1.0.0',
  license: { spdx: 'LicenseRef-Unity-Asset-Store-EULA', redistributable: false },
  materials: [
    {
      id: 'grass01',
      name: 'Grass 01',
      size: 1024,
      maps: { color: 'materials/grass01/color.jpg', normal: 'materials/grass01/normal.png', roughness: 'materials/grass01/roughness.png' },
    },
    { id: 'lava', name: 'Lava', size: 1024, maps: { emissive: 'materials/lava/emissive.jpg' } },
    { id: 'snow', name: 'Snow', size: 1024, maps: { normal: 'materials/snow/normal.png' }, incomplete: true },
  ],
});

describe('parsePackageManifest', () => {
  it('aceita o manifesto do pacote e aplica defaults', () => {
    const m = parsePackageManifest(base());
    expect(m.materials[0].tiling).toBe(1);
    expect(m.materials[0].tags).toEqual([]);
    expect(m.materials[2].incomplete).toBe(true);
  });

  it('recusa material completo sem cor nem emissivo', () => {
    const raw = base();
    raw.materials[2] = { id: 'snow', name: 'Snow', size: 1024, maps: { normal: 'materials/snow/normal.png' } } as never;
    expect(() => parsePackageManifest(raw)).toThrow(/color.*emissive/);
  });

  it('recusa caminho que sai da pasta do pacote', () => {
    const raw = base();
    raw.materials[0].maps.color = '../../evil.jpg';
    expect(() => parsePackageManifest(raw)).toThrow(/relativo/);
  });

  it('recusa versão fora de X.Y.Z e kind desconhecido', () => {
    expect(() => parsePackageManifest({ ...base(), version: 'latest' })).toThrow(/version/);
    expect(() => parsePackageManifest({ ...base(), kind: 'models' })).toThrow(/kind/);
  });

  it('valida o sha256 do archive', () => {
    expect(() =>
      parsePackageManifest({ ...base(), archive: { file: 'x.zip', sha256: 'abc', bytes: 1 } }),
    ).toThrow(/archive\.sha256/);
  });
});

describe('packageMaterialPicks', () => {
  it('um item por material com cor, com URLs relativas à pasta do pacote', () => {
    const picks = packageMaterialPicks(parsePackageManifest(base()), '/assets/packages/cortex-yughues-ground-textures');
    expect(picks).toHaveLength(1);
    expect(picks[0]).toEqual({
      name: 'Grass 01',
      thumb: '/assets/packages/cortex-yughues-ground-textures/materials/grass01/color.jpg',
      group: 'Yughues — Ground',
      value: {
        diffuse: '/assets/packages/cortex-yughues-ground-textures/materials/grass01/color.jpg',
        normal: '/assets/packages/cortex-yughues-ground-textures/materials/grass01/normal.png',
        roughness: '/assets/packages/cortex-yughues-ground-textures/materials/grass01/roughness.png',
      },
    });
  });
});
