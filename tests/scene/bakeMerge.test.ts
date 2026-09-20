/**
 * Bake do merge numa passada só (SPEC-0217): o grupo é escrito direto no buffer
 * de destino, com a matriz assada nos vértices. O contrato a defender é
 * equivalência com o caminho antigo (`clone` + `applyMatrix4` + `mergeGeometries`
 * do three) e a recusa conservadora quando o grupo não é fundível.
 */
import { describe, it, expect } from 'vitest';
import { BufferAttribute, BufferGeometry, BoxGeometry, Matrix4, PlaneGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeMergedGeometry, type BakePart } from '../../src/scene/bakeMerge.js';

/** Caminho ANTIGO, para comparação: clona, assa a matriz e funde com o three. */
function legacyMerge(parts: BakePart[]): BufferGeometry | null {
  const clones = parts.map(({ geometry, matrix }) => {
    const g = geometry.clone();
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) flipWindingLegacy(g);
    return g;
  });
  return mergeGeometries(clones, false);
}

/** O `flipWinding` que existia no StaticMerge antes do bake. */
function flipWindingLegacy(g: BufferGeometry): void {
  const index = g.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    return;
  }
  for (const name of Object.keys(g.attributes)) {
    const attr = g.attributes[name] as BufferAttribute;
    const size = attr.itemSize;
    const array = attr.array as unknown as number[];
    for (let i = 0; i < attr.count; i += 3) {
      for (let k = 0; k < size; k++) {
        const um = (i + 1) * size + k;
        const dois = (i + 2) * size + k;
        const tmp = array[um]!;
        array[um] = array[dois]!;
        array[dois] = tmp;
      }
    }
  }
}

function expectSameGeometry(a: BufferGeometry | null, b: BufferGeometry | null): void {
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  const names = Object.keys(b!.attributes).sort();
  expect(Object.keys(a!.attributes).sort()).toEqual(names);
  for (const name of names) {
    const got = a!.attributes[name] as BufferAttribute;
    const want = b!.attributes[name] as BufferAttribute;
    expect(got.itemSize).toBe(want.itemSize);
    expect(got.count).toBe(want.count);
    for (let i = 0; i < want.array.length; i++) {
      expect(got.array[i]).toBeCloseTo(want.array[i]!, 4);
    }
  }
  expect(a!.index === null).toBe(b!.index === null);
  if (want_index(b!)) {
    expect(Array.from(a!.index!.array)).toEqual(Array.from(b!.index!.array));
  }
}

function want_index(g: BufferGeometry): boolean {
  return g.index !== null;
}

describe('bakeMergedGeometry', () => {
  it('funde duas caixas transladadas igual ao caminho antigo do three', () => {
    const parts: BakePart[] = [
      { geometry: new BoxGeometry(1, 1, 1), matrix: new Matrix4().makeTranslation(5, 0, 0) },
      { geometry: new BoxGeometry(1, 1, 1), matrix: new Matrix4().makeTranslation(0, 3, -2) },
    ];
    const baked = bakeMergedGeometry(parts);
    const legacy = legacyMerge(parts.map((p) => ({ ...p })));
    expectSameGeometry(baked, legacy);
  });

  it('assa rotação + escala com normais renormalizadas', () => {
    const matrix = new Matrix4()
      .makeRotationY(Math.PI / 3)
      .multiply(new Matrix4().makeScale(2, 0.5, 1.5));
    const parts: BakePart[] = [
      { geometry: new BoxGeometry(1, 2, 3), matrix },
      { geometry: new BoxGeometry(1, 2, 3), matrix: new Matrix4().makeTranslation(1, 1, 1) },
    ];
    expectSameGeometry(bakeMergedGeometry(parts), legacyMerge(parts.map((p) => ({ ...p }))));

    // normais continuam unitárias mesmo com escala não-uniforme
    const normal = bakeMergedGeometry(parts)!.attributes['normal'] as BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      expect(len).toBeCloseTo(1, 4);
    }
  });

  it('inverte o winding de malha espelhada, indexada (SPEC-0214)', () => {
    const mirrored = new Matrix4().makeScale(-1, 1, 1);
    const parts: BakePart[] = [
      { geometry: new BoxGeometry(1, 1, 1), matrix: mirrored },
      { geometry: new BoxGeometry(1, 1, 1), matrix: new Matrix4().makeTranslation(2, 0, 0) },
    ];
    const baked = bakeMergedGeometry(parts)!;
    const legacy = legacyMerge(parts.map((p) => ({ ...p })))!;
    expect(Array.from(baked.index!.array)).toEqual(Array.from(legacy.index!.array));
  });

  it('inverte o winding de malha espelhada SEM índice', () => {
    const plane = new PlaneGeometry(1, 1).toNonIndexed();
    const parts: BakePart[] = [
      { geometry: plane, matrix: new Matrix4().makeScale(-1, 1, 1) },
      { geometry: plane.clone(), matrix: new Matrix4().makeTranslation(3, 0, 0) },
    ];
    const baked = bakeMergedGeometry(parts);
    const legacy = legacyMerge([
      { geometry: plane.clone(), matrix: new Matrix4().makeScale(-1, 1, 1) },
      { geometry: plane.clone(), matrix: new Matrix4().makeTranslation(3, 0, 0) },
    ]);
    expect(baked!.index).toBeNull();
    expectSameGeometry(baked, legacy);
  });

  it('preserva uv e demais atributos na cópia crua', () => {
    const parts: BakePart[] = [
      { geometry: new PlaneGeometry(2, 2), matrix: new Matrix4().makeTranslation(1, 0, 0) },
      { geometry: new PlaneGeometry(2, 2), matrix: new Matrix4().makeTranslation(0, 1, 0) },
    ];
    const baked = bakeMergedGeometry(parts)!;
    const uv = baked.attributes['uv'] as BufferAttribute;
    const srcUv = (parts[0]!.geometry.attributes['uv'] as BufferAttribute).array;
    expect(uv.count).toBe(8);
    for (let i = 0; i < srcUv.length; i++) expect(uv.array[i]).toBeCloseTo(srcUv[i]!, 6);
  });

  it('recusa (null) quando os atributos não batem', () => {
    const comUv = new PlaneGeometry(1, 1);
    const semUv = new PlaneGeometry(1, 1);
    semUv.deleteAttribute('uv');
    const out = bakeMergedGeometry([
      { geometry: comUv, matrix: new Matrix4() },
      { geometry: semUv, matrix: new Matrix4() },
    ]);
    expect(out).toBeNull();
  });

  it('recusa (null) quando uma parte tem índice e a outra não', () => {
    const indexada = new PlaneGeometry(1, 1);
    const solta = new PlaneGeometry(1, 1).toNonIndexed();
    const out = bakeMergedGeometry([
      { geometry: indexada, matrix: new Matrix4() },
      { geometry: solta, matrix: new Matrix4() },
    ]);
    expect(out).toBeNull();
  });

  it('usa índice de 32 bits quando passa de 65535 vértices', () => {
    const big = (): BufferGeometry => {
      const count = 40000;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
      g.setIndex(new BufferAttribute(new Uint16Array(count), 1));
      return g;
    };
    const out = bakeMergedGeometry([
      { geometry: big(), matrix: new Matrix4() },
      { geometry: big(), matrix: new Matrix4().makeTranslation(1, 0, 0) },
    ])!;
    expect(out.index!.array).toBeInstanceOf(Uint32Array);
    expect(out.attributes['position']!.count).toBe(80000);
  });

  it('devolve null para lista vazia', () => {
    expect(bakeMergedGeometry([])).toBeNull();
  });
});
