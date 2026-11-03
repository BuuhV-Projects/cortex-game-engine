/**
 * Contagem de triângulos do orçamento de kit (SPEC-0670): o modo da primitiva decide a conta.
 */
import { describe, it, expect } from 'vitest';
import { Document, Primitive, type GLTF } from '@gltf-transform/core';
// @ts-expect-error — script .mjs sem tipos; é ferramenta de asset, não API do engine.
import { trianglesOf } from '../../native/scripts/kit-tris.mjs';

function primitiva(mode: GLTF.MeshPrimitiveMode, indices: number) {
  const doc = new Document();
  return doc.createPrimitive()
    .setMode(mode)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(9)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)));
}

describe('trianglesOf', () => {
  it('lista de triângulos: índices / 3', () => {
    expect(trianglesOf(primitiva(Primitive.Mode.TRIANGLES, 6000))).toBe(2000);
  });

  it('faixa e leque: índices − 2', () => {
    expect(trianglesOf(primitiva(Primitive.Mode.TRIANGLE_STRIP, 6002))).toBe(6000);
    expect(trianglesOf(primitiva(Primitive.Mode.TRIANGLE_FAN, 6002))).toBe(6000);
  });

  it('pontos e linhas não contam', () => {
    expect(trianglesOf(primitiva(Primitive.Mode.POINTS, 30))).toBe(0);
    expect(trianglesOf(primitiva(Primitive.Mode.LINES, 30))).toBe(0);
  });
});
