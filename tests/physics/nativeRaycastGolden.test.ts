// Golden de paridade do raycast nativo (SPEC-0347): o caminho JS (`firstHitAmong`
// sem ponte) responde ≥ 200 raios aleatórios contra uma cena determinística e o
// resultado vira native/tests/raycast_golden.h, que o raycast_parity_test.cpp do
// host confere. `CORTEX_WRITE_RAYCAST_GOLDEN=1` regrava; sem ele, o golden tem de
// bater com o JS de hoje.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  InstancedMesh,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SphereGeometry,
  TorusKnotGeometry,
  Vector3,
  type Side,
} from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/physics/raycastAccel.js';
import { firstHitAmong, setNativeRaycastBridge } from '../../src/physics/nativeRaycast.js';

const GOLDEN = resolve(__dirname, '../../native/tests/raycast_golden.h');
const RAYS = 240;
const SEED = 0x5eed347;
const INSTANCES = 24;
const WORLD = 18;
const FLOAT_DIGITS = 9;
const DOUBLE_DIGITS = 17;

/** mulberry32: aleatório determinístico. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function interleaved(src: BufferGeometry): BufferGeometry {
  // posição + normal no mesmo buffer (o GLB cozido do export vem assim), índice 32 bits
  const pos = src.attributes['position']!;
  const nor = src.attributes['normal']!;
  const stride = 6;
  const data = new Float32Array(pos.count * stride);
  // normal antes da posição: exercita o deslocamento (3) além do passo (6)
  for (let i = 0; i < pos.count; i++) {
    data.set([nor.getX(i), nor.getY(i), nor.getZ(i), pos.getX(i), pos.getY(i), pos.getZ(i)], i * stride);
  }
  const buf = new InterleavedBuffer(data, stride);
  const g = new BufferGeometry();
  g.setAttribute('normal', new InterleavedBufferAttribute(buf, 3, 0));
  g.setAttribute('position', new InterleavedBufferAttribute(buf, 3, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(src.index!.array), 1));
  return g;
}

interface Scene {
  geometries: BufferGeometry[];
  meshes: Mesh[];
}

function buildScene(rand: () => number): Scene {
  const geometries = [
    new BoxGeometry(2, 3, 1.5), // índice 16 bits, poucos triângulos (sem árvore no JS)
    new SphereGeometry(1.5, 16, 12), // com árvore no JS
    new PlaneGeometry(40, 40, 4, 4),
    new IcosahedronGeometry(1.2, 1).toNonIndexed(), // sem índice
    interleaved(new TorusKnotGeometry(1.4, 0.35, 48, 6)),
    new ConeGeometry(0.6, 1.8, 10),
  ];
  const sides: Side[] = [FrontSide, BackSide, DoubleSide];
  const place = (m: Mesh, scaleSpread: number): void => {
    m.position.set((rand() - 0.5) * WORLD, (rand() - 0.5) * WORLD * 0.5, (rand() - 0.5) * WORLD);
    m.quaternion.setFromAxisAngle(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2);
    m.scale.set(1 + rand() * scaleSpread, 1 + rand() * scaleSpread, 1 + rand() * scaleSpread);
    m.updateMatrixWorld(true);
  };
  const meshes: Mesh[] = [];
  const ground = new Mesh(geometries[2], new MeshBasicMaterial({ side: FrontSide }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -6;
  ground.updateMatrixWorld(true);
  meshes.push(ground);
  for (let i = 0; i < 14; i++) {
    const gi = [0, 1, 3, 4][i % 4]!;
    const m = new Mesh(geometries[gi], new MeshBasicMaterial({ side: sides[i % sides.length] }));
    place(m, i % 2 === 0 ? 0 : 1.5); // metade com escala não-uniforme
    meshes.push(m);
  }
  const inst = new InstancedMesh(geometries[5], new MeshBasicMaterial({ side: DoubleSide }), INSTANCES);
  const mat = new Matrix4();
  for (let i = 0; i < INSTANCES; i++) {
    mat.compose(
      new Vector3((rand() - 0.5) * WORLD, (rand() - 0.5) * WORLD * 0.5, (rand() - 0.5) * WORLD),
      new Quaternion().setFromAxisAngle(new Vector3(rand(), rand(), rand() - 0.5).normalize(), rand() * Math.PI),
      new Vector3(0.5 + rand(), 0.5 + rand(), 0.5 + rand()),
    );
    inst.setMatrixAt(i, mat);
  }
  inst.position.set(0.5, 0.25, -0.5);
  inst.updateMatrixWorld(true);
  meshes.push(inst);
  return { geometries, meshes };
}

interface Expected {
  mesh: number;
  instance: number;
  distance: number;
  point: Vector3;
}

function castRays(scene: Scene, rand: () => number): { rays: number[][]; expected: Expected[] } {
  const raycaster = Object.assign(new Raycaster(), { firstHitOnly: true });
  const rays: number[][] = [];
  const expected: Expected[] = [];
  for (let r = 0; r < RAYS; r++) {
    const o = new Vector3((rand() - 0.5) * WORLD * 1.5, (rand() - 0.5) * WORLD, (rand() - 0.5) * WORLD * 1.5);
    let d: Vector3;
    if (r % 3 === 0) {
      d = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(); // a esmo
    } else {
      // mira numa malha (com desvio) pra ter acertos
      const target = scene.meshes[Math.floor(rand() * scene.meshes.length)]!.position;
      d = target.clone().add(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2)).sub(o).normalize();
    }
    if (r % 4 === 1) d.set(0, -1, 0); // raio de chão
    const far = r % 5 === 0 ? 6 + rand() * 10 : Infinity;
    raycaster.set(o, d);
    raycaster.near = 0;
    raycaster.far = far;
    const h = firstHitAmong(raycaster, scene.meshes, null);
    rays.push([o.x, o.y, o.z, d.x, d.y, d.z, 0, far]);
    expected.push(
      h
        ? { mesh: scene.meshes.indexOf(h.object as Mesh), instance: h.instanceId ?? -1, distance: h.distance, point: h.point }
        : { mesh: -1, instance: -1, distance: 0, point: new Vector3() },
    );
  }
  return { rays, expected };
}

const f = (v: number): string => `${Number.isFinite(v) ? v.toPrecision(FLOAT_DIGITS) : '0'}f`;
const dbl = (v: number): string => (Number.isFinite(v) ? v.toPrecision(DOUBLE_DIGITS) : 'kInf');
const list = (xs: string[]): string => `{${xs.join(', ')}}`;

function header(scene: Scene, rays: number[][], expected: Expected[]): string {
  const out: string[] = [
    '// GERADO por tests/physics/nativeRaycastGolden.test.ts (CORTEX_WRITE_RAYCAST_GOLDEN=1) — NÃO edite à mão.',
    '// Cena determinística + raios + 1º acerto do caminho JS (SPEC-0347).',
    '#pragma once',
    '',
    '#include <cstdint>',
    '#include <limits>',
    '',
    'namespace raycast_golden {',
    '',
    'constexpr double kInf = std::numeric_limits<double>::infinity();',
    '',
  ];
  scene.geometries.forEach((g, i) => {
    const pos = g.attributes['position'] as BufferAttribute | InterleavedBufferAttribute;
    const il = (pos as InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
    const arr = il ? (pos as InterleavedBufferAttribute).data.array : (pos as BufferAttribute).array;
    out.push(`constexpr float kPos${i}[] = ${list(Array.from(arr as Float32Array, f))};`);
    out.push(`constexpr uint32_t kIdx${i}[] = ${g.index ? list(Array.from(g.index.array, String)) : '{0}'};`);
  });
  out.push('', 'struct Geometry { const float* pos; unsigned stride; unsigned offset; unsigned vertices; const uint32_t* index; unsigned indexCount; };');
  out.push('constexpr Geometry kGeometries[] = {');
  scene.geometries.forEach((g, i) => {
    const pos = g.attributes['position'] as BufferAttribute | InterleavedBufferAttribute;
    const il = (pos as InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
    const stride = il ? (pos as InterleavedBufferAttribute).data.stride : pos.itemSize;
    const offset = il ? (pos as InterleavedBufferAttribute).offset : 0;
    out.push(`  {kPos${i}, ${stride}, ${offset}, ${pos.count}, ${g.index ? `kIdx${i}, ${g.index.count}` : 'nullptr, 0'}},`);
  });
  out.push('};', '');
  const inst = scene.meshes.find((m) => (m as InstancedMesh).isInstancedMesh) as InstancedMesh;
  out.push(`constexpr unsigned kInstanceCount = ${inst.count};`);
  out.push(`constexpr float kInstances[] = ${list(Array.from(inst.instanceMatrix.array as Float32Array, f))};`, '');
  out.push('struct MeshDef { int geometry; int side; bool instanced; double matrix[16]; };');
  out.push('constexpr MeshDef kMeshes[] = {');
  for (const m of scene.meshes) {
    const gi = scene.geometries.indexOf(m.geometry);
    const side = (m.material as MeshBasicMaterial).side;
    const instanced = (m as InstancedMesh).isInstancedMesh === true;
    out.push(`  {${gi}, ${side}, ${instanced}, ${list(m.matrixWorld.elements.map(dbl))}},`);
  }
  out.push('};', '');
  out.push('struct Ray { double v[8]; int mesh; int instance; double distance; double point[3]; };');
  out.push('constexpr Ray kRays[] = {');
  rays.forEach((r, i) => {
    const e = expected[i]!;
    out.push(`  {${list(r.map(dbl))}, ${e.mesh}, ${e.instance}, ${dbl(e.distance)}, ${list([e.point.x, e.point.y, e.point.z].map(dbl))}},`);
  });
  out.push('};', '', '}  // namespace raycast_golden', '');
  return out.join('\n');
}

describe('golden do raycast nativo (SPEC-0347)', () => {
  afterEach(() => setNativeRaycastBridge(undefined));

  it('o caminho JS bate com native/tests/raycast_golden.h', () => {
    setNativeRaycastBridge(null);
    const rand = rng(SEED);
    const scene = buildScene(rand);
    const { rays, expected } = castRays(scene, rand);
    const hits = expected.filter((e) => e.mesh >= 0);
    expect(rays.length).toBeGreaterThanOrEqual(200);
    expect(hits.length).toBeGreaterThan(RAYS / 3); // a cena tem acerto de verdade
    expect(hits.some((e) => e.instance >= 0)).toBe(true);
    const text = header(scene, rays, expected);
    if (process.env['CORTEX_WRITE_RAYCAST_GOLDEN'] === '1') writeFileSync(GOLDEN, text);
    expect(readFileSync(GOLDEN, 'utf8')).toBe(text);
  });
});
