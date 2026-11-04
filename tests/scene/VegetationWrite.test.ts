/**
 * SPEC-0675 (b): a `Vegetation` escreve as matrizes direto no `instanceMatrix` (mesmo resultado do caminho
 * `Euler`/`compose`/`computeBoundingSphere` do `three`), aceita buffer do chamador sem cópia e escreve por faixa.
 */
import { describe, expect, it } from 'vitest';
import { Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, BoxGeometry, Quaternion, Sphere, Vector3 } from 'three';
import { Vegetation, FLOATS_PER_INSTANCE, makePlaceholderVegetation } from '../../src/scene/Vegetation.js';

const TREES = 64;
const DIGITS = 4;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** `[x,y,z,rotY,scale]` sintéticos. */
function forest(n: number, seed = 7): number[] {
  const r = lcg(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r() * 200 - 100, r() * 3, r() * 200 - 100, r() * 6.28, 0.5 + r());
  return out;
}

function meshes(veg: Vegetation): InstancedMesh[] {
  return veg.group.children as InstancedMesh[];
}

/** O caminho de antes: `Euler` → `compose` → `local` → `setMatrixAt`, e o `computeBoundingSphere` do `three`. */
function expectSameAsThree(veg: Vegetation, flat: ArrayLike<number>, local: Matrix4[]): void {
  const t = new Matrix4();
  const m = new Matrix4();
  const got = new Matrix4();
  meshes(veg).forEach((mesh, s) => {
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const b = i * FLOATS_PER_INSTANCE;
      const sc = flat[b + 4]!;
      t.compose(new Vector3(flat[b]!, flat[b + 1]!, flat[b + 2]!), new Quaternion().setFromEuler(new Euler(0, flat[b + 3]!, 0)), new Vector3(sc, sc, sc));
      m.multiplyMatrices(t, local[s]!);
      mesh.getMatrixAt(i, got);
      for (let k = 0; k < 16; k++) expect(got.elements[k]).toBeCloseTo(m.elements[k]!, DIGITS);
    }
    const expected = new Sphere();
    const copy = new InstancedMesh(mesh.geometry, mesh.material, n);
    copy.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, n * 16));
    copy.count = n;
    copy.computeBoundingSphere();
    expected.copy(copy.boundingSphere!);
    expect(mesh.boundingSphere!.radius).toBeCloseTo(expected.radius, DIGITS);
    expect(mesh.boundingSphere!.center.distanceTo(expected.center)).toBeLessThan(1e-3);
  });
}

/** Modelo com sub-malha deslocada e escalada (a transform local que entra na matriz). */
function offsetModel(): { model: Group; local: Matrix4[] } {
  const model = new Group();
  const crown = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
  crown.position.set(0.3, 2, -0.2);
  crown.rotation.set(0.1, 0.4, 0);
  crown.scale.set(1.5, 1, 1.2);
  model.add(crown);
  model.updateMatrixWorld(true);
  return { model, local: [crown.matrixWorld.clone()] };
}

describe('Vegetation — escrita direta e sem cópia (SPEC-0675)', () => {
  it('as matrizes e a esfera saem iguais às do caminho do three', () => {
    const { model, local } = offsetModel();
    const veg = new Vegetation(model, TREES);
    const flat = forest(TREES);
    veg.setInstances(flat);
    expectSameAsThree(veg, flat, local);
  });

  it('adoptInstances usa o buffer do chamador sem copiar', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    const data = new Float32Array(forest(TREES));
    veg.adoptInstances(data);
    expect(veg.count).toBe(TREES);
    expect(veg.instanceData).toBe(data);
    expect(veg.getInstances()).toEqual(Array.from(data));
  });

  it('writeInstances escreve só a faixa e marca o upload dela', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    veg.setInstances(forest(TREES));
    meshes(veg)[0]!.instanceMatrix.clearUpdateRanges(); // o render subiu a escrita inteira
    const before = Array.from(meshes(veg)[0]!.instanceMatrix.array.subarray(0, 16));
    const cell = forest(4, 99);
    veg.writeInstances(10, cell);
    const mesh = meshes(veg)[0]!;
    expect(Array.from(mesh.instanceMatrix.array.subarray(0, 16))).toEqual(before);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 10 * 16, count: 4 * 16 }]);
    expect(veg.instanceAt(10)).toEqual({ x: cell[0], y: cell[1], z: cell[2], rotY: cell[3], scale: cell[4] });
    expect(veg.count).toBe(TREES);
  });

  it('escrita inteira e faixa no mesmo quadro sobem as duas', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    veg.setInstances(forest(TREES));
    veg.writeInstances(10, forest(4, 99));
    const ranges = meshes(veg)[0]!.instanceMatrix.updateRanges;
    // Lista vazia faria o `three` subir tudo; com faixa, a inteira precisa estar nela.
    expect(ranges.length).toBeGreaterThan(0);
    const lo = Math.min(...ranges.map((r) => r.start));
    const hi = Math.max(...ranges.map((r) => r.start + r.count));
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(TREES * 16);
  });

  it('a esfera cresce para cobrir a faixa escrita longe', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    veg.setInstances(forest(8));
    const far = new Vector3(5000, 0, 5000);
    veg.writeInstances(2, [far.x, far.y, far.z, 0, 1]);
    for (const mesh of meshes(veg)) expect(mesh.boundingSphere!.containsPoint(far)).toBe(true);
  });

  it('faixa além do total sobe o total e o vão fica invisível', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    veg.setInstances(forest(2));
    veg.writeInstances(5, forest(1, 3));
    expect(veg.count).toBe(6);
    expect(veg.instanceAt(3)!.scale).toBe(0);
  });

  it('writeInstances mantém a máscara da estrada; setInstances a zera', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    const flat = forest(8);
    veg.setInstances(flat);
    const mask = new Uint8Array(8);
    mask[3] = 1;
    veg.setHidden(mask);
    veg.writeInstances(3, flat.slice(15, 20));
    const m = new Matrix4();
    meshes(veg)[0]!.getMatrixAt(3, m);
    expect(m.getMaxScaleOnAxis()).toBe(0);
    veg.setInstances(flat);
    meshes(veg)[0]!.getMatrixAt(3, m);
    expect(m.getMaxScaleOnAxis()).toBeGreaterThan(0);
  });

  it('syncInstances reflete a mutação feita no buffer adotado', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    const data = new Float64Array(forest(TREES));
    veg.adoptInstances(data);
    data[5 * FLOATS_PER_INSTANCE] = 1234;
    veg.syncInstances(5, 1);
    const m = new Matrix4();
    meshes(veg)[0]!.getMatrixAt(5, m);
    expect(new Vector3().setFromMatrixPosition(m).x).toBeCloseTo(1234, 1);
  });

  it('faixa fora da capacidade é recusada', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), 4);
    expect(() => veg.writeInstances(3, forest(2))).toThrow(RangeError);
  });

  it('as edições do editor funcionam sobre um buffer adotado sem mexer nele', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    const data = new Float32Array(forest(4));
    const copy = Array.from(data);
    veg.adoptInstances(data);
    expect(veg.removeAt(0)).toBe(true);
    expect(veg.count).toBe(3);
    expect(Array.from(data)).toEqual(copy);
    expect(veg.add(1, 2, 3, 0, 1)).toBe(true);
    expect(veg.count).toBe(4);
  });

  it('muitas faixas sem upload se fundem numa que cobre todas', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    veg.setInstances(forest(TREES));
    for (let i = 40; i > 0; i--) veg.writeInstances(i, forest(1, i));
    const ranges = meshes(veg)[0]!.instanceMatrix.updateRanges;
    expect(ranges.length).toBeLessThanOrEqual(32);
    const covers = (inst: number): boolean => ranges.some((r) => r.start <= inst * 16 && r.start + r.count >= (inst + 1) * 16);
    for (let i = 1; i <= 40; i++) expect(covers(i)).toBe(true);
  });
});
