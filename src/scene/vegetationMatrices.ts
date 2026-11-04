/**
 * Matrizes de instância da {@link Vegetation} escritas direto no `instanceMatrix` (SPEC-0675 (b)), com a esfera de
 * culling acumulada no mesmo laço. Substitui `Euler` → `Quaternion` → `compose` → `multiplyMatrices` →
 * `setMatrixAt` por instância e o `InstancedMesh.computeBoundingSphere` que percorria tudo de novo.
 */
import { Sphere, type InstancedMesh, type Matrix4 } from 'three';

/** Campos por instância no formato plano (`[x,y,z,rotY,scale]`) — o `FLOATS_PER_INSTANCE` da `Vegetation`. */
const FLOATS_PER_INSTANCE = 5;
const MATRIX_FLOATS = 16;

/** Uma sub-malha: a malha instanciada e a transform local dela no modelo. */
export interface VegetationSub {
  mesh: InstancedMesh;
  local: Matrix4;
}

/**
 * Escreve as matrizes `T(pos)·Ry(rot)·S(scale)·local` das instâncias `[first, first+count)` de `data`
 * (`[x,y,z,rotY,scale]` por instância; `hidden[i] = 1` = escala 0, SPEC-0631 §3b) em todas as sub-malhas e
 * une a esfera de cada uma à `mesh.boundingSphere` (que o chamador esvaziou, numa escrita inteira, ou mantém, numa
 * faixa — aí a esfera só cresce). A esfera de uma instância é a do `computeBoundingSphere` do `three` (a da geometria
 * levada pela matriz), calculada com a matriz em `double` antes de ir para o `Float32Array` — difere do `three`, que
 * relê a matriz já arredondada, só no arredondamento de `float`.
 */
export function writeInstanceMatrices(
  subs: readonly VegetationSub[],
  data: ArrayLike<number>,
  hidden: Uint8Array | null,
  first: number,
  count: number,
): void {
  const acc = accumulators(subs.length);
  for (let s = 0; s < subs.length; s++) {
    const mesh = subs[s]!.mesh;
    if (mesh.boundingSphere === null) mesh.boundingSphere = new Sphere().makeEmpty();
    if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
    const bs = mesh.boundingSphere;
    const a = s * SPHERE_FLOATS;
    acc[a] = bs.center.x;
    acc[a + 1] = bs.center.y;
    acc[a + 2] = bs.center.z;
    acc[a + 3] = bs.radius;
  }
  const end = first + count;
  for (let i = first; i < end; i++) {
    const b = i * FLOATS_PER_INSTANCE;
    const x = data[b]!;
    const y = data[b + 1]!;
    const z = data[b + 2]!;
    const rot = data[b + 3]!;
    const scale = hidden !== null && hidden[i] ? 0 : data[b + 4]!;
    // Ry(rot)·S(scale): as colunas do `Matrix4.makeRotationY` vezes a escala.
    const cs = Math.cos(rot) * scale;
    const ss = Math.sin(rot) * scale;
    for (let s = 0; s < subs.length; s++) {
      const sub = subs[s]!;
      writeOne(sub, sub.mesh.instanceMatrix.array as Float32Array, i * MATRIX_FLOATS, x, y, z, cs, ss, scale, acc, s * SPHERE_FLOATS);
    }
  }
  for (let s = 0; s < subs.length; s++) {
    const a = s * SPHERE_FLOATS;
    const bs = subs[s]!.mesh.boundingSphere!;
    bs.center.set(acc[a]!, acc[a + 1]!, acc[a + 2]!);
    bs.radius = acc[a + 3]!;
  }
}

/** Floats do acumulador de esfera por sub-malha (centro + raio). */
const SPHERE_FLOATS = 4;
let _acc = new Float64Array(SPHERE_FLOATS * 4);

function accumulators(subs: number): Float64Array {
  if (_acc.length < subs * SPHERE_FLOATS) _acc = new Float64Array(subs * SPHERE_FLOATS);
  return _acc;
}

/**
 * `T·Ry·S` (colunas `[cs,0,-ss]`, `[0,scale,0]`, `[ss,0,cs]`, `[x,y,z]`) vezes `local`, escrita em `out[at..at+16)`,
 * e a esfera da geometria por essa matriz unida ao acumulador `acc[a..a+4)`. Desenrolado: sem JIT cada laço e cada
 * chamada de método é interpretado.
 */
function writeOne(
  sub: VegetationSub, out: Float32Array, at: number,
  x: number, y: number, z: number, cs: number, ss: number, scale: number,
  acc: Float64Array, a: number,
): void {
  const l = sub.local.elements;
  const m0 = cs * l[0]! + ss * l[2]! + x * l[3]!;
  const m1 = scale * l[1]! + y * l[3]!;
  const m2 = cs * l[2]! - ss * l[0]! + z * l[3]!;
  const m3 = l[3]!;
  const m4 = cs * l[4]! + ss * l[6]! + x * l[7]!;
  const m5 = scale * l[5]! + y * l[7]!;
  const m6 = cs * l[6]! - ss * l[4]! + z * l[7]!;
  const m7 = l[7]!;
  const m8 = cs * l[8]! + ss * l[10]! + x * l[11]!;
  const m9 = scale * l[9]! + y * l[11]!;
  const m10 = cs * l[10]! - ss * l[8]! + z * l[11]!;
  const m11 = l[11]!;
  const m12 = cs * l[12]! + ss * l[14]! + x * l[15]!;
  const m13 = scale * l[13]! + y * l[15]!;
  const m14 = cs * l[14]! - ss * l[12]! + z * l[15]!;
  const m15 = l[15]!;
  out[at] = m0;
  out[at + 1] = m1;
  out[at + 2] = m2;
  out[at + 3] = m3;
  out[at + 4] = m4;
  out[at + 5] = m5;
  out[at + 6] = m6;
  out[at + 7] = m7;
  out[at + 8] = m8;
  out[at + 9] = m9;
  out[at + 10] = m10;
  out[at + 11] = m11;
  out[at + 12] = m12;
  out[at + 13] = m13;
  out[at + 14] = m14;
  out[at + 15] = m15;
  // A esfera da instância: `Vector3.applyMatrix4` (com o `w`) e `Matrix4.getMaxScaleOnAxis`, como no `three`.
  const g = sub.mesh.geometry.boundingSphere!;
  const gx = g.center.x;
  const gy = g.center.y;
  const gz = g.center.z;
  const w = 1 / (m3 * gx + m7 * gy + m11 * gz + m15);
  const cx = (m0 * gx + m4 * gy + m8 * gz + m12) * w;
  const cy = (m1 * gx + m5 * gy + m9 * gz + m13) * w;
  const cz = (m2 * gx + m6 * gy + m10 * gz + m14) * w;
  const sx = m0 * m0 + m1 * m1 + m2 * m2;
  const sy = m4 * m4 + m5 * m5 + m6 * m6;
  const sz = m8 * m8 + m9 * m9 + m10 * m10;
  const big = sx > sy ? (sx > sz ? sx : sz) : sy > sz ? sy : sz;
  // Escala 0 (vão de `writeInstances` ou máscara da estrada) não desenha: a matriz nula iria para a origem e
  // esticaria a esfera de culling até lá.
  if (scale !== 0) unite(acc, a, cx, cy, cz, g.radius * Math.sqrt(big));
}

/**
 * `Sphere.union` do `three` em escalares sobre o acumulador `acc[a..a+4)` (centro, raio): o mesmo resultado, sem
 * `Vector3` nem chamada de método por instância.
 */
function unite(acc: Float64Array, a: number, cx: number, cy: number, cz: number, r: number): void {
  if (r < 0) return; // esfera vazia não muda nada
  const radius = acc[a + 3]!;
  if (radius < 0) {
    acc[a] = cx;
    acc[a + 1] = cy;
    acc[a + 2] = cz;
    acc[a + 3] = r;
    return;
  }
  const dx = cx - acc[a]!;
  const dy = cy - acc[a + 1]!;
  const dz = cz - acc[a + 2]!;
  if (dx === 0 && dy === 0 && dz === 0) {
    if (r > radius) acc[a + 3] = r;
    return;
  }
  // `_v2 = (c - C).setLength(r)`; depois `expandByPoint(c + _v2)` e `expandByPoint(c - _v2)`.
  const k = r / Math.sqrt(dx * dx + dy * dy + dz * dz);
  expand(acc, a, cx + dx * k, cy + dy * k, cz + dz * k);
  expand(acc, a, cx - dx * k, cy - dy * k, cz - dz * k);
}

/** `Sphere.expandByPoint` do `three` (esfera não vazia). */
function expand(acc: Float64Array, a: number, px: number, py: number, pz: number): void {
  const vx = px - acc[a]!;
  const vy = py - acc[a + 1]!;
  const vz = pz - acc[a + 2]!;
  const lengthSq = vx * vx + vy * vy + vz * vz;
  const radius = acc[a + 3]!;
  if (lengthSq <= radius * radius) return;
  const length = Math.sqrt(lengthSq);
  const delta = (length - radius) * 0.5;
  const f = delta / length;
  acc[a] += vx * f;
  acc[a + 1] += vy * f;
  acc[a + 2] += vz * f;
  acc[a + 3] = radius + delta;
}
