/**
 * Grade do {@link Terrain} em arrays planos (SPEC-0729 §2): índice, normais e esfera envolvente sem `Vector3` por
 * vértice nem `number[]` intermediário. As normais e a esfera repetem a aritmética do `computeVertexNormals` e do
 * `computeBoundingSphere` do three operação por operação, então o resultado é idêntico bit a bit.
 */
import { Sphere } from 'three';

/** Componentes por vértice (x, y, z) nos arrays de posição e de normal. */
const XYZ = 3;
/** Vértices por triângulo. */
const TRI = 3;
/** Índices por célula da grade (dois triângulos). */
const INDICES_PER_CELL = 6;
/**
 * Maior índice que ainda cabe num `Uint16Array` para o three: o `arrayNeedsUint32` passa a `Uint32` quando algum
 * índice é `>= 65535` (reserva o `PRIMITIVE_RESTART_FIXED_INDEX`).
 */
const UINT16_INDEX_LIMIT = 65535;
/** Metade: o centro da caixa é `(min + max) · HALF`, como o `Box3.getCenter`. */
const HALF = 0.5;

/** Índice da grade (Uint16 ou Uint32, como o `setIndex` do three escolheria). */
export type GridIndex = Uint16Array | Uint32Array;

/** Moldes por resolução; cada terreno recebe uma cópia (o `dispose` de um não pode soltar o buffer dos outros). */
const indexTemplates = new Map<number, GridIndex>();

/**
 * Índice da grade `resolution × resolution`: `a, c, b, b, c, d` por célula (viradas para +Y), em `Uint32Array` só
 * quando o maior índice (`(res+1)² − 1`) chega a 65.535. Devolve sempre uma cópia nova do molde em cache.
 */
export function gridIndex(resolution: number): GridIndex {
  let template = indexTemplates.get(resolution);
  if (!template) {
    template = buildGridIndex(resolution);
    indexTemplates.set(resolution, template);
  }
  return template.slice();
}

/** Monta o índice da grade (o molde de {@link gridIndex}). */
function buildGridIndex(resolution: number): GridIndex {
  const n = resolution + 1;
  const maxIndex = n * n - 1;
  const out = maxIndex >= UINT16_INDEX_LIMIT
    ? new Uint32Array(resolution * resolution * INDICES_PER_CELL)
    : new Uint16Array(resolution * resolution * INDICES_PER_CELL);
  let k = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      out[k++] = a;
      out[k++] = c;
      out[k++] = b;
      out[k++] = b;
      out[k++] = c;
      out[k++] = d;
    }
  }
  return out;
}

/**
 * Normais por vértice em `normals` (mesmo tamanho de `positions`), com a aritmética do `computeVertexNormals` do
 * three: zera, acumula `(C−B)×(A−B)` de cada triângulo nos três vértices (lendo e gravando no `Float32Array`, como o
 * atributo) e normaliza cada vértice com `x · (1 / (‖n‖ || 1))`.
 */
export function gridNormals(positions: Float32Array, index: ArrayLike<number>, normals: Float32Array): void {
  normals.fill(0);
  for (let i = 0, il = index.length; i < il; i += TRI) {
    const vA = index[i]! * XYZ;
    const vB = index[i + 1]! * XYZ;
    const vC = index[i + 2]! * XYZ;
    const bx = positions[vB]!;
    const by = positions[vB + 1]!;
    const bz = positions[vB + 2]!;
    // cb = pC − pB, ab = pA − pB (em double, como o subVectors)
    const cbx = positions[vC]! - bx;
    const cby = positions[vC + 1]! - by;
    const cbz = positions[vC + 2]! - bz;
    const abx = positions[vA]! - bx;
    const aby = positions[vA + 1]! - by;
    const abz = positions[vA + 2]! - bz;
    // cb.cross(ab) = crossVectors(cb, ab)
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    accumulate(normals, vA, nx, ny, nz);
    accumulate(normals, vB, nx, ny, nz);
    accumulate(normals, vC, nx, ny, nz);
  }
  for (let o = 0, ol = normals.length; o < ol; o += XYZ) {
    const x = normals[o]!;
    const y = normals[o + 1]!;
    const z = normals[o + 2]!;
    // Vector3.normalize = divideScalar(length || 1) = multiplyScalar(1 / s)
    const s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    normals[o] = x * s;
    normals[o + 1] = y * s;
    normals[o + 2] = z * s;
  }
}

/** Soma `n` na normal do vértice em `o` (lê float32, soma em double, grava float32, como o three). */
function accumulate(normals: Float32Array, o: number, nx: number, ny: number, nz: number): void {
  normals[o] = normals[o]! + nx;
  normals[o + 1] = normals[o + 1]! + ny;
  normals[o + 2] = normals[o + 2]! + nz;
}

/**
 * Esfera envolvente de `positions` igual à do `computeBoundingSphere` do three (geometria sem morph): o centro é o
 * centro da caixa e o raio é a raiz da maior distância ao quadrado até um vértice. Grava em `target`, se vier.
 */
export function gridBoundingSphere(positions: Float32Array, target: Sphere = new Sphere()): Sphere {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let o = 0, ol = positions.length; o < ol; o += XYZ) {
    const x = positions[o]!;
    const y = positions[o + 1]!;
    const z = positions[o + 2]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const center = target.center;
  // Box3.getCenter: caixa vazia (sem vértice) → origem; senão (min + max) · HALF
  if (maxX < minX || maxY < minY || maxZ < minZ) center.set(0, 0, 0);
  else center.set((minX + maxX) * HALF, (minY + maxY) * HALF, (minZ + maxZ) * HALF);
  const cx = center.x;
  const cy = center.y;
  const cz = center.z;
  let maxRadiusSq = 0;
  for (let o = 0, ol = positions.length; o < ol; o += XYZ) {
    const dx = cx - positions[o]!;
    const dy = cy - positions[o + 1]!;
    const dz = cz - positions[o + 2]!;
    maxRadiusSq = Math.max(maxRadiusSq, dx * dx + dy * dy + dz * dz);
  }
  target.radius = Math.sqrt(maxRadiusSq);
  return target;
}
