import { BufferAttribute, BufferGeometry, Matrix3, type Matrix4 } from 'three';

/**
 * **Fusão de um grupo de geometrias numa passada só** (SPEC-0217).
 *
 * O caminho anterior pagava três varreduras dos vértices por instância —
 * `clone()` → `applyMatrix4()` → `mergeGeometries()` — e o `applyMatrix4` do
 * three transforma vértice a vértice com `Vector3`/`Matrix3` temporários. No
 * host nativo (Hermes, sem JIT) isso custava 3,4 s em 1600 instâncias do
 * kart-racer, contra 0,05 s do clone: o gargalo era o objeto por vértice, não a
 * cópia de memória.
 *
 * Aqui o buffer do grupo é alocado UMA vez (soma dos counts) e cada instância é
 * escrita já transformada direto no destino, com laço plano sobre os
 * `Float32Array` e os coeficientes da matriz em variáveis locais.
 *
 * Conservador por construção: qualquer incompatibilidade entre as partes
 * (atributo faltando, `itemSize`/tipo diferente, índice em umas e não em
 * outras, `position`/`normal` não-float) devolve `null` — o chamador mantém as
 * malhas separadas, como o `mergeGeometries` fazia ao recusar um grupo.
 */

/** Vértices por triângulo — o `flipWinding` troca o 2º com o 3º. */
const TRIANGLE_VERTICES = 3;
/** Componentes de um vetor 3D (position/normal). */
const VEC3_ITEMS = 3;
/** `tangent` do glTF: xyz direcional + w com o sinal da bitangente. */
const TANGENT_ITEMS = 4;
/** Maior índice representável em `Uint16Array` — acima disso, índice de 32 bits. */
const UINT16_MAX = 65535;

/** Uma instância a fundir: a geometria (já plana) e a matriz a assar nela. */
export interface BakePart {
  geometry: BufferGeometry;
  /** Transform a "assar" nos vértices (mundo, no merge de cena; local, na subárvore). */
  matrix: Matrix4;
}

/** Só transformamos atributos em ponto flutuante; o resto é cópia crua. */
function isFloatAttribute(attr: BufferAttribute): boolean {
  return attr.array instanceof Float32Array && !attr.normalized;
}

/**
 * As partes são fundíveis entre si? Exige os mesmos atributos (nome, itemSize,
 * tipo de array, `normalized`) e concordância sobre ter índice.
 */
function compatible(parts: readonly BufferGeometry[]): boolean {
  const first = parts[0];
  if (!first) return false;
  const names = Object.keys(first.attributes).sort();
  const hasIndex = first.index !== null;
  for (const geo of parts) {
    if ((geo.index !== null) !== hasIndex) return false;
    const other = Object.keys(geo.attributes).sort();
    if (other.length !== names.length) return false;
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!;
      if (other[i] !== name) return false;
      const a = first.attributes[name] as BufferAttribute | undefined;
      const b = geo.attributes[name] as BufferAttribute | undefined;
      if (!a || !b) return false;
      if (a.itemSize !== b.itemSize) return false;
      if (a.normalized !== b.normalized) return false;
      if (a.array.constructor !== b.array.constructor) return false;
    }
    // position/normal/tangent precisam ser float pra receber a matriz.
    for (const name of ['position', 'normal', 'tangent']) {
      const attr = geo.attributes[name] as BufferAttribute | undefined;
      if (attr && !isFloatAttribute(attr)) return false;
    }
  }
  return true;
}

/** Índice de destino: 16 bits enquanto couber, 32 acima disso. */
function makeIndexArray(vertexTotal: number, length: number): Uint16Array | Uint32Array {
  return vertexTotal > UINT16_MAX ? new Uint32Array(length) : new Uint16Array(length);
}

/**
 * Funde `parts` numa geometria só, com cada matriz assada nos vértices.
 *
 * @param parts - Instâncias do grupo (2+ pra valer a pena; 1 o chamador mantém).
 * @returns A geometria fundida, ou `null` se o grupo não for fundível.
 */
export function bakeMergedGeometry(parts: readonly BakePart[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const geometries = parts.map((p) => p.geometry);
  if (!compatible(geometries)) return null;

  const first = geometries[0]!;
  const names = Object.keys(first.attributes);
  const indexed = first.index !== null;

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const geo of geometries) {
    const position = geo.attributes['position'] as BufferAttribute | undefined;
    if (!position) return null;
    vertexTotal += position.count;
    indexTotal += geo.index ? geo.index.count : 0;
  }

  // Destino: um array por atributo, alocado de uma vez só.
  const dst = new Map<string, { array: Float32Array | ArrayLike<number> & { set(a: ArrayLike<number>, o: number): void }; itemSize: number; normalized: boolean }>();
  for (const name of names) {
    const attr = first.attributes[name] as BufferAttribute;
    const Ctor = attr.array.constructor as new (length: number) => Float32Array;
    dst.set(name, {
      array: new Ctor(vertexTotal * attr.itemSize),
      itemSize: attr.itemSize,
      normalized: attr.normalized,
    });
  }
  const dstIndex = indexed ? makeIndexArray(vertexTotal, indexTotal) : null;

  const normalMatrix = new Matrix3();
  let vertexOffset = 0;
  let indexOffset = 0;

  for (let p = 0; p < parts.length; p++) {
    const { matrix } = parts[p]!;
    const geo = geometries[p]!;
    const m = matrix.elements;
    // Espelhada (determinante < 0): a matriz corrige as normais, mas inverte a
    // orientação das faces — sem destrocar o winding a face some (SPEC-0214).
    const flip = matrix.determinant() < 0;
    normalMatrix.getNormalMatrix(matrix);
    const n = normalMatrix.elements;
    const count = (geo.attributes['position'] as BufferAttribute).count;

    for (const name of names) {
      const src = geo.attributes[name] as BufferAttribute;
      const out = dst.get(name)!;
      const size = out.itemSize;
      const srcArray = src.array as ArrayLike<number>;
      const dstArray = out.array as Float32Array;
      const base = vertexOffset * size;

      if (name === 'position' && size >= VEC3_ITEMS) {
        for (let i = 0; i < count; i++) {
          const s = i * size;
          const d = base + i * size;
          const x = srcArray[s]!;
          const y = srcArray[s + 1]!;
          const z = srcArray[s + 2]!;
          const w = 1 / (m[3]! * x + m[7]! * y + m[11]! * z + m[15]!);
          dstArray[d] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * w;
          dstArray[d + 1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * w;
          dstArray[d + 2] = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * w;
        }
      } else if (name === 'normal' && size >= VEC3_ITEMS) {
        for (let i = 0; i < count; i++) {
          const s = i * size;
          const d = base + i * size;
          const x = srcArray[s]!;
          const y = srcArray[s + 1]!;
          const z = srcArray[s + 2]!;
          const nx = n[0]! * x + n[3]! * y + n[6]! * z;
          const ny = n[1]! * x + n[4]! * y + n[7]! * z;
          const nz = n[2]! * x + n[5]! * y + n[8]! * z;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          dstArray[d] = nx / len;
          dstArray[d + 1] = ny / len;
          dstArray[d + 2] = nz / len;
        }
      } else if (name === 'tangent' && size === TANGENT_ITEMS) {
        // Direcional: rotação/escala da matriz, sem translação, renormalizado.
        for (let i = 0; i < count; i++) {
          const s = i * size;
          const d = base + i * size;
          const x = srcArray[s]!;
          const y = srcArray[s + 1]!;
          const z = srcArray[s + 2]!;
          const tx = m[0]! * x + m[4]! * y + m[8]! * z;
          const ty = m[1]! * x + m[5]! * y + m[9]! * z;
          const tz = m[2]! * x + m[6]! * y + m[10]! * z;
          const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
          dstArray[d] = tx / len;
          dstArray[d + 1] = ty / len;
          dstArray[d + 2] = tz / len;
          dstArray[d + 3] = srcArray[s + 3]!; // sinal da bitangente
        }
      } else {
        // uv, color, qualquer outro: cópia crua do bloco inteiro.
        (out.array as unknown as { set(a: ArrayLike<number>, o: number): void }).set(srcArray, base);
      }
    }

    if (dstIndex && geo.index) {
      const srcIndex = geo.index.array as ArrayLike<number>;
      const total = geo.index.count;
      if (flip) {
        for (let i = 0; i < total; i += TRIANGLE_VERTICES) {
          dstIndex[indexOffset + i] = srcIndex[i]! + vertexOffset;
          dstIndex[indexOffset + i + 1] = srcIndex[i + 2]! + vertexOffset;
          dstIndex[indexOffset + i + 2] = srcIndex[i + 1]! + vertexOffset;
        }
      } else {
        for (let i = 0; i < total; i++) dstIndex[indexOffset + i] = srcIndex[i]! + vertexOffset;
      }
      indexOffset += total;
    } else if (flip) {
      // Sem índice: destroca o 2º com o 3º vértice de cada triângulo, em todos
      // os atributos (a permutação tem que valer pra posição E pros uvs).
      for (const name of names) {
        const out = dst.get(name)!;
        const size = out.itemSize;
        const dstArray = out.array as Float32Array;
        const base = vertexOffset * size;
        for (let i = 0; i < count; i += TRIANGLE_VERTICES) {
          const b = base + (i + 1) * size;
          const c = base + (i + 2) * size;
          for (let k = 0; k < size; k++) {
            const tmp = dstArray[b + k]!;
            dstArray[b + k] = dstArray[c + k]!;
            dstArray[c + k] = tmp;
          }
        }
      }
    }

    vertexOffset += count;
  }

  const merged = new BufferGeometry();
  for (const [name, out] of dst) {
    merged.setAttribute(name, new BufferAttribute(out.array as Float32Array, out.itemSize, out.normalized));
  }
  if (dstIndex) merged.setIndex(new BufferAttribute(dstIndex, 1));
  return merged;
}
