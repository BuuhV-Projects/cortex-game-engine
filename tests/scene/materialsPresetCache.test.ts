/**
 * Testes do cache de preset de material (src/scene/Materials.ts, SPEC-0196):
 * malhas que compartilham o material de origem e a config recebem a MESMA
 * instância de material (e a mesma rampa de tom), o que derruba bind groups por
 * frame e devolve ao `mergeStaticScene` grupos reais pra fundir.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, Object3D, BoxGeometry, MeshStandardMaterial, MeshToonMaterial, Texture } from 'three';
import { applyMaterial, clearMaterial, clearMaterialPresetCache } from '../../src/scene/Materials.js';

/** Material de origem compartilhado, como o cache de `loadGLB` entrega aos clones. */
function sharedSource(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0x336699 });
  mat.map = new Texture();
  return mat;
}

/** N malhas com o MESMO material de origem (clones de um `.glb` cacheado). */
function clones(count: number, source: MeshStandardMaterial): Mesh[] {
  return Array.from({ length: count }, () => new Mesh(new BoxGeometry(1, 1, 1), source));
}

describe('cache de preset de material (SPEC-0196)', () => {
  it('malhas com o mesmo material de origem e a mesma config compartilham UMA instância', () => {
    const source = sharedSource();
    const meshes = clones(34, source); // as 34 árvores iguais do caso real

    for (const mesh of meshes) applyMaterial(mesh, { type: 'toon', shading: 'cel' });

    const distinct = new Set(meshes.map((m) => m.material));
    expect(distinct.size).toBe(1);
    expect(meshes[0]!.material).toBeInstanceOf(MeshToonMaterial);
  });

  it('a rampa de tom (gradientMap) é compartilhada, não uma DataTexture por material', () => {
    const source = sharedSource();
    const other = sharedSource(); // origem DIFERENTE → preset diferente, mesma rampa
    const a = new Mesh(new BoxGeometry(1, 1, 1), source);
    const b = new Mesh(new BoxGeometry(1, 1, 1), other);

    applyMaterial(a, { type: 'toon', shading: 'cel' });
    applyMaterial(b, { type: 'toon', shading: 'cel' });

    expect(a.material).not.toBe(b.material); // origens distintas preservam cor/map próprios
    const rampA = (a.material as unknown as MeshToonMaterial).gradientMap;
    const rampB = (b.material as unknown as MeshToonMaterial).gradientMap;
    expect(rampA).toBeTruthy();
    expect(rampA).toBe(rampB);
  });

  it('configs diferentes geram presets diferentes', () => {
    const source = sharedSource();
    const [a, b, c] = clones(3, source) as [Mesh, Mesh, Mesh];

    applyMaterial(a, { type: 'toon', shading: 'cel' });
    applyMaterial(b, { type: 'toon', shading: 'bands', gradientSteps: 4 });
    applyMaterial(c, { type: 'unlit', color: 0xff8800 });

    expect(a.material).not.toBe(b.material);
    expect(a.material).not.toBe(c.material);
    expect(b.material).not.toBe(c.material);
  });

  it('a chave ignora a ordem dos campos da config', () => {
    const source = sharedSource();
    const [a, b] = clones(2, source) as [Mesh, Mesh];

    applyMaterial(a, { type: 'unlit', color: 0x112233, opacity: 0.5 });
    applyMaterial(b, { opacity: 0.5, color: 0x112233, type: 'unlit' });

    expect(a.material).toBe(b.material);
  });

  it('contorno não entra na chave — é malha extra, não propriedade do material', () => {
    const source = sharedSource();
    const [a, b] = clones(2, source) as [Mesh, Mesh];
    const holderA = new Object3D().add(a);
    const holderB = new Object3D().add(b);

    applyMaterial(holderA, { type: 'toon', shading: 'cel' });
    applyMaterial(holderB, { type: 'toon', shading: 'cel', outline: 0.02 });

    expect(a.material).toBe(b.material);
    expect(b.children.length).toBe(1); // a casca do inverted-hull entrou no próprio mesh
    expect(a.children.length).toBe(0);
  });

  it('clearMaterial restaura o original SEM destruir o preset que outras malhas usam', () => {
    const source = sharedSource();
    const [a, b] = clones(2, source) as [Mesh, Mesh];

    applyMaterial(a, { type: 'toon', shading: 'cel' });
    applyMaterial(b, { type: 'toon', shading: 'cel' });
    const shared = b.material as MeshToonMaterial;
    let disposed = false;
    shared.addEventListener('dispose', () => { disposed = true; });

    clearMaterial(a);

    expect(a.material).toBe(source);
    expect(b.material).toBe(shared);
    expect(disposed).toBe(false);
  });

  it('o preset fica marcado como residente (cortexCached) pro disposeAll da troca de fase', () => {
    const source = sharedSource();
    const mesh = clones(1, source)[0]!;

    applyMaterial(mesh, { type: 'toon', shading: 'cel' });

    const preset = mesh.material as MeshToonMaterial;
    expect(preset.userData['cortexCached']).toBe(true);
    expect(preset.gradientMap!.userData['cortexCached']).toBe(true);
  });

  it('clearMaterialPresetCache dispõe os presets e a próxima aplicação constrói de novo', () => {
    const source = sharedSource();
    const mesh = clones(1, source)[0]!;
    applyMaterial(mesh, { type: 'toon', shading: 'cel' });
    const before = mesh.material as MeshToonMaterial;
    let disposed = false;
    before.addEventListener('dispose', () => { disposed = true; });

    clearMaterialPresetCache();
    const other = new Mesh(new BoxGeometry(1, 1, 1), source);
    applyMaterial(other, { type: 'toon', shading: 'cel' });

    expect(disposed).toBe(true);
    expect(other.material).not.toBe(before);
  });
});
