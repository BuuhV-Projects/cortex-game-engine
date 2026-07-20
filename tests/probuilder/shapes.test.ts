/**
 * Testes da biblioteca de formas de blockout (src/probuilder/shapes.ts) e da
 * conversão pra geometria de render (src/probuilder/EditableMesh.ts). Ver SPEC-0071.
 *
 * Foco: topologia válida (índices em faixa, faces fechadas), determinismo das
 * formas paramétricas e os invariantes de render (mapas de picking) + extrusão.
 */
import { describe, it, expect } from 'vitest';
import {
  SHAPES,
  buildShape,
  defaultShapeParams,
  boxMesh,
  mergeMeshes,
  type ShapeKind,
} from '../../src/probuilder/shapes.js';
import {
  toBufferGeometry,
  extrudeFace,
  faceNormal,
  faceCentroid,
  meshEdges,
  cloneMesh,
  verticesOfElement,
  centroidOf,
  translateVertices,
} from '../../src/probuilder/EditableMesh.js';

const ALL = Object.keys(SHAPES) as ShapeKind[];

/** Toda face referencia índices válidos e tem ao menos 3 vértices. */
function assertValidTopology(kind: string, m: { positions: unknown[]; faces: number[][] }) {
  expect(m.positions.length, `${kind}: tem vértices`).toBeGreaterThan(0);
  expect(m.faces.length, `${kind}: tem faces`).toBeGreaterThan(0);
  for (const f of m.faces) {
    expect(f.length, `${kind}: face com >=3 vértices`).toBeGreaterThanOrEqual(3);
    for (const i of f) {
      expect(Number.isInteger(i)).toBe(true);
      expect(i, `${kind}: índice em faixa`).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(m.positions.length);
    }
    // sem índices repetidos numa face
    expect(new Set(f).size, `${kind}: face sem vértice repetido`).toBe(f.length);
  }
}

describe('shapes — catálogo', () => {
  it('toda forma tem builder, label e params com defaults numéricos', () => {
    for (const kind of ALL) {
      const def = SHAPES[kind];
      expect(def.kind).toBe(kind);
      expect(def.label.length).toBeGreaterThan(0);
      for (const pd of def.params) {
        expect(typeof pd.default).toBe('number');
        expect(pd.key.length).toBeGreaterThan(0);
      }
    }
  });

  it('gera topologia válida com params default', () => {
    for (const kind of ALL) {
      assertValidTopology(kind, buildShape(kind));
    }
  });

  it('é determinística (mesmos params → mesma malha)', () => {
    for (const kind of ALL) {
      expect(buildShape(kind)).toEqual(buildShape(kind, defaultShapeParams(kind)));
    }
  });
});

describe('boxMesh', () => {
  it('tem 8 vértices e 6 faces quad', () => {
    const m = boxMesh([-1, -1, -1], [1, 1, 1]);
    expect(m.positions).toHaveLength(8);
    expect(m.faces).toHaveLength(6);
    for (const f of m.faces) expect(f).toHaveLength(4);
  });

  it('12 arestas únicas (cubo)', () => {
    expect(meshEdges(boxMesh([0, 0, 0], [1, 1, 1]))).toHaveLength(12);
  });
});

describe('mergeMeshes', () => {
  it('reindexa faces com offset acumulado', () => {
    const a = boxMesh([0, 0, 0], [1, 1, 1]);
    const b = boxMesh([2, 0, 0], [3, 1, 1]);
    const merged = mergeMeshes(a, b);
    expect(merged.positions).toHaveLength(16);
    expect(merged.faces).toHaveLength(12);
    // As faces do 2º box devem apontar pros vértices 8..15.
    const maxIdx = Math.max(...merged.faces.flat());
    expect(maxIdx).toBe(15);
  });

  it('escada tem N degraus = N boxes', () => {
    const m = buildShape('stairs', { ...defaultShapeParams('stairs'), steps: 5 });
    expect(m.positions).toHaveLength(5 * 8);
    expect(m.faces).toHaveLength(5 * 6);
  });

  it('parede com vão sem peitoril = 3 boxes; com peitoril = 4', () => {
    const noSill = buildShape('wallOpening', { ...defaultShapeParams('wallOpening'), sill: 0 });
    const withSill = buildShape('wallOpening', { ...defaultShapeParams('wallOpening'), sill: 0.5 });
    expect(noSill.faces).toHaveLength(3 * 6);
    expect(withSill.faces).toHaveLength(4 * 6);
  });
});

describe('faceNormal / faceCentroid', () => {
  it('topo do cubo aponta +Y, base -Y', () => {
    const m = boxMesh([-1, -1, -1], [1, 1, 1]);
    // ordem das faces em boxMesh: [+Z,-Z,+X,-X,+Y,-Y]
    const top = faceNormal(m, 4);
    const bottom = faceNormal(m, 5);
    expect(top[1]).toBeGreaterThan(0.9);
    expect(bottom[1]).toBeLessThan(-0.9);
  });

  it('centróide da face +Z fica em z=+1', () => {
    const m = boxMesh([-1, -1, -1], [1, 1, 1]);
    expect(faceCentroid(m, 0)[2]).toBeCloseTo(1);
  });
});

describe('toBufferGeometry', () => {
  it('triangula (quad → 2 tris) e produz mapas coerentes', () => {
    const m = boxMesh([-1, -1, -1], [1, 1, 1]); // 6 quads → 12 tris
    const { geometry, maps } = toBufferGeometry(m);
    const pos = geometry.getAttribute('position');
    expect(pos.count).toBe(12 * 3); // 36 vértices de render (flat, não-indexado)
    expect(maps.triToFace).toHaveLength(12);
    expect(maps.renderVertToVert).toHaveLength(36);
    // todo render-vert mapeia pra um vértice lógico válido
    for (const v of maps.renderVertToVert) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(m.positions.length);
    }
    // cada face vira exatamente 2 triângulos
    for (let f = 0; f < 6; f++) {
      expect(maps.triToFace.filter((x) => x === f)).toHaveLength(2);
    }
    expect(geometry.getAttribute('normal').count).toBe(36);
  });
});

describe('edição de elementos (verticesOfElement / translateVertices)', () => {
  const cube = () => boxMesh([-1, -1, -1], [1, 1, 1]);

  it('verticesOfElement: vértice=1, aresta=2, face=N', () => {
    const m = cube();
    expect(verticesOfElement(m, { mode: 'vertex', index: 3 })).toEqual([3]);
    expect(verticesOfElement(m, { mode: 'edge', a: 0, b: 1 })).toEqual([0, 1]);
    expect(verticesOfElement(m, { mode: 'face', faceIndex: 0 })).toHaveLength(4);
  });

  it('translateVertices é não-destrutivo e move só os índices dados', () => {
    const m = cube();
    const before = cloneMesh(m);
    const out = translateVertices(m, [0], [10, 0, 0]);
    expect(m).toEqual(before); // original intacto
    expect(out.positions[0]).toEqual([9, -1, -1]);
    expect(out.positions[1]).toEqual([1, -1, -1]); // vizinho intacto
  });

  it('mover uma face inteira desloca seu centróide pelo delta', () => {
    const m = cube();
    const face = { mode: 'face' as const, faceIndex: 4 }; // +Y
    const verts = verticesOfElement(m, face);
    const out = translateVertices(m, verts, [0, 2, 0]);
    const c0 = centroidOf(m, verts);
    const c1 = centroidOf(out, verts);
    expect(c1[1] - c0[1]).toBeCloseTo(2);
  });
});

describe('extrudeFace', () => {
  it('é não-destrutivo (não muta a malha original)', () => {
    const m = boxMesh([-1, -1, -1], [1, 1, 1]);
    const before = cloneMesh(m);
    extrudeFace(m, 4, 1);
    expect(m).toEqual(before);
  });

  it('extruda o topo: 4 vértices novos + 4 paredes; a face vira a tampa deslocada', () => {
    const m = boxMesh([-1, -1, -1], [1, 1, 1]);
    const topNormal = faceNormal(m, 4); // +Y
    const { mesh: out, faceIndex } = extrudeFace(m, 4, 2);
    expect(out.positions).toHaveLength(8 + 4); // 4 vértices novos
    expect(out.faces).toHaveLength(6 + 4); // 4 paredes laterais novas
    // a tampa subiu ~2 em Y
    const cy = faceCentroid(out, faceIndex)[1];
    expect(cy).toBeCloseTo(1 + 2);
    // a normal da tampa continua +Y
    expect(faceNormal(out, faceIndex)[1]).toBeCloseTo(topNormal[1]);
    // topologia continua válida
    assertValidTopology('extruded', out);
  });
});
