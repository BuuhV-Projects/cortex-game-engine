import { InstancedMesh, Matrix4, Mesh, Sphere, type Intersection, type Raycaster } from 'three';

/**
 * Raycast de `InstancedMesh` com esferas em cache (SPEC-0305). O do three, pra cada
 * raio, lê a matriz e transforma a esfera de TODAS as instâncias; aqui as esferas em
 * coordenadas do mundo ficam guardadas por malha e o raio descarta por elas antes do
 * teste da geometria. Mesmos acertos que o three.
 */

/** Folga relativa da esfera: o descarte nunca pode cortar um acerto por arredondamento. */
const SPHERE_SLACK = 1e-6;
/** Floats por instância no cache: centro x, y, z e raio. */
const STRIDE = 4;
const MATRIX_SIZE = 16;

interface SphereCache {
  version: number;
  count: number;
  world: Float64Array;
  base: Sphere | null;
  spheres: Float32Array;
}

const caches = new WeakMap<InstancedMesh, SphereCache>();
const instanceLocal = new Matrix4();
const instanceWorld = new Matrix4();
const sphere = new Sphere();
const probe = new Mesh();
const probeHits: Intersection[] = [];

/** O raio (origem `o`, direção unitária `d`, até `far`) pode tocar a esfera? `false` só quando é certeza que não. */
export function rayMayHitSphere(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  far: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
): boolean {
  const rr = r * (1 + SPHERE_SLACK) + SPHERE_SLACK;
  const dx = cx - o.x;
  const dy = cy - o.y;
  const dz = cz - o.z;
  const t = dx * d.x + dy * d.y + dz * d.z; // projeção do centro na reta
  if (t < -rr || t - rr > far) return false; // toda atrás da origem ou além do alcance
  return dx * dx + dy * dy + dz * dz - t * t <= rr * rr; // distância da reta ao centro
}

/** Esferas das instâncias no mundo, refeitas só quando algo que as define mudou. */
function spheresOf(mesh: InstancedMesh): SphereCache {
  const geo = mesh.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const base = geo.boundingSphere;
  const e = mesh.matrixWorld.elements;
  let c = caches.get(mesh);
  const stale =
    !c ||
    c.version !== mesh.instanceMatrix.version ||
    c.count !== mesh.count ||
    c.base !== base ||
    e.some((v, i) => v !== c!.world[i]);
  if (!stale) return c!;
  c ??= { version: -1, count: -1, world: new Float64Array(MATRIX_SIZE), base: null, spheres: new Float32Array(0) };
  if (c.spheres.length < mesh.count * STRIDE) c.spheres = new Float32Array(mesh.count * STRIDE);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, instanceLocal);
    instanceWorld.multiplyMatrices(mesh.matrixWorld, instanceLocal);
    if (base) sphere.copy(base).applyMatrix4(instanceWorld);
    const k = i * STRIDE;
    c.spheres[k] = base ? sphere.center.x : 0;
    c.spheres[k + 1] = base ? sphere.center.y : 0;
    c.spheres[k + 2] = base ? sphere.center.z : 0;
    c.spheres[k + 3] = base ? sphere.radius : Infinity; // sem esfera: nunca descarta
  }
  c.version = mesh.instanceMatrix.version;
  c.count = mesh.count;
  c.world.set(e);
  c.base = base;
  caches.set(mesh, c);
  return c;
}

/** `InstancedMesh.raycast` com descarte por esfera em cache (instalado em `raycastAccel`). */
export function instancedRaycast(this: InstancedMesh, raycaster: Raycaster, intersects: Intersection[]): void {
  if (this.material === undefined) return;
  // mesma 1ª barreira do three: a esfera da malha inteira
  if (this.boundingSphere === null) this.computeBoundingSphere();
  sphere.copy(this.boundingSphere!).applyMatrix4(this.matrixWorld);
  if (!raycaster.ray.intersectsSphere(sphere)) return;
  const c = spheresOf(this);
  const { origin, direction } = raycaster.ray;
  probe.geometry = this.geometry;
  probe.material = this.material;
  for (let i = 0; i < c.count; i++) {
    const k = i * STRIDE;
    if (!rayMayHitSphere(origin, direction, raycaster.far, c.spheres[k]!, c.spheres[k + 1]!, c.spheres[k + 2]!, c.spheres[k + 3]!)) continue;
    this.getMatrixAt(i, instanceLocal);
    probe.matrixWorld.multiplyMatrices(this.matrixWorld, instanceLocal);
    probe.raycast(raycaster, probeHits);
    for (const h of probeHits) {
      h.instanceId = i;
      h.object = this;
      intersects.push(h);
    }
    probeHits.length = 0;
  }
}
