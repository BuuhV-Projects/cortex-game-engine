/**
 * `NearMeshIndex.rebuild` com a MESMA lista (SPEC-0674): só o slot sujo é recalculado e muda de célula, e as
 * consultas dão exatamente o que o caminho completo (lista remontada) daria.
 */
import { describe, it, expect } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Ray, Vector3 } from 'three';
import { NearMeshIndex } from '../../src/physics/nearMeshes.js';

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function scene(n: number, rnd: () => number): { root: Object3D; meshes: Mesh[] } {
  const root = new Object3D();
  const meshes: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    // umas compridas (lista larga), a maioria pequena
    const long = i % 17 === 0;
    const m = new Mesh(new BoxGeometry(long ? 300 : 1 + rnd() * 3, 1, 1 + rnd() * 3), new MeshBasicMaterial());
    m.position.set(rnd() * 200 - 100, rnd() * 4, rnd() * 200 - 100);
    root.add(m);
    meshes.push(m);
  }
  root.updateMatrixWorld(true);
  return { root, meshes };
}

/** O caminho completo: lista "nova" (força o `WeakMap` e a grade inteira), com o mesmo histórico de registros. */
function fullRebuild(index: NearMeshIndex, meshes: readonly Object3D[]): void {
  index.rebuild([]);
  index.rebuild(meshes);
}

function sameQueries(a: NearMeshIndex, b: NearMeshIndex, rnd: () => number): void {
  const outA: Object3D[] = [];
  const outB: Object3D[] = [];
  const entA: number[] = [];
  const entB: number[] = [];
  for (let q = 0; q < 200; q++) {
    const x = rnd() * 240 - 120;
    const z = rnd() * 240 - 120;
    const reach = q % 10 === 0 ? 60 : rnd() * 6;
    expect(a.nearXZ(x, z, reach, outA)).toEqual(b.nearXZ(x, z, reach, outB));
    const ray = new Ray(new Vector3(x, 2, z), new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize());
    const far = rnd() * 50;
    expect(a.alongRay(ray, 0, far, outA, entA)).toEqual(b.alongRay(ray, 0, far, outB, entB));
    expect(entA).toEqual(entB);
  }
}

describe('NearMeshIndex — rebuild só do sujo (SPEC-0674)', () => {
  it('parada, movida, girada e parada de novo: consultas iguais às do caminho completo', () => {
    const rnd = rng(11);
    const { root, meshes } = scene(300, rnd);
    const dirty = new NearMeshIndex();
    const full = new NearMeshIndex();
    for (let round = 0; round < 6; round++) {
      // rodadas 1–3 mexem em parte das malhas; as outras deixam tudo parado (folga volta à estática)
      if (round >= 1 && round <= 3) {
        for (let i = round; i < meshes.length; i += 7) {
          const m = meshes[i]!;
          if (i % 2 === 0) m.position.x += rnd() * 30 - 15;
          else m.rotation.y += 0.7;
        }
        root.updateMatrixWorld(true);
      }
      dirty.rebuild(meshes);
      fullRebuild(full, meshes);
      sameQueries(dirty, full, rnd);
    }
  });

  it('lista com malha a mais ou a menos volta ao caminho completo', () => {
    const rnd = rng(5);
    const { meshes } = scene(80, rnd);
    const dirty = new NearMeshIndex();
    const full = new NearMeshIndex();
    dirty.rebuild(meshes);
    fullRebuild(full, meshes);
    const fewer = meshes.slice(0, 50);
    dirty.rebuild(fewer);
    fullRebuild(full, fewer);
    sameQueries(dirty, full, rnd);
    dirty.rebuild(meshes);
    fullRebuild(full, meshes);
    sameQueries(dirty, full, rnd);
  });

  it('a mesma lista reescrita no lugar pelo chamador é reconhecida como igual', () => {
    const rnd = rng(3);
    const { root, meshes } = scene(40, rnd);
    const list: Object3D[] = [...meshes];
    const index = new NearMeshIndex();
    index.rebuild(list);
    // o chamador esvazia e repõe os mesmos objetos (como a varredura do personagem)
    list.length = 0;
    list.push(...meshes);
    meshes[0]!.position.set(500, 0, 500);
    root.updateMatrixWorld(true);
    index.rebuild(list);
    expect(index.nearXZ(500, 500, 1, [])).toEqual([meshes[0]]);
    expect(index.nearXZ(500, 500, 1, []).length).toBe(1);
  });
});
