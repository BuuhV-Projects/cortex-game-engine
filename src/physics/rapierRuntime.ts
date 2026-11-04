// Partes internas do RapierPhysics (SPEC-0671): carga do WASM, handle de corpo,
// collider por spec e trimesh de um Object3D. NÃO é API pública — o `.d.ts` do
// RapierPhysics não referencia este módulo.
import type RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, type Object3D, type Mesh } from 'three';
import type { BodySpec, PhysicsBody, QuatLike, Vec3Like } from './RapierPhysics.js';

/** Tipo do namespace-valor do Rapier (o default export), carregado sob demanda. */
export type RapierApi = (typeof import('@dimforge/rapier3d-compat'))['default'];

let api: RapierApi | null = null;
let initPromise: Promise<void> | null = null;

/** Carrega o Rapier (dynamic import do chunk `rapier.js`) e inicializa o WASM — uma vez só. */
export function loadRapier(): Promise<void> {
  return (initPromise ??= (async () => {
    const mod = await import('@dimforge/rapier3d-compat');
    api = mod.default;
    await api.init();
  })());
}

/** O namespace do Rapier já inicializado (erro se chamado antes do init). */
export function rapier(): RapierApi {
  if (!api) throw new Error('Rapier não inicializado — use RapierPhysics.create() (await).');
  return api;
}

/** Handle de corpo que não vaza o tipo do Rapier ({@link PhysicsBody}). */
export class RapierBody implements PhysicsBody {
  constructor(private readonly body: RAPIER.RigidBody) {}
  translation(): Vec3Like {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }
  rotation(): QuatLike {
    const r = this.body.rotation();
    return { x: r.x, y: r.y, z: r.z, w: r.w };
  }
  linvel(): Vec3Like {
    const v = this.body.linvel();
    return { x: v.x, y: v.y, z: v.z };
  }
  angvel(): Vec3Like {
    const v = this.body.angvel();
    return { x: v.x, y: v.y, z: v.z };
  }
  setNextKinematicTranslation(p: Vec3Like): void {
    this.body.setNextKinematicTranslation(p);
  }
  applyImpulse(impulse: Vec3Like, wakeUp = true): void {
    this.body.applyImpulse(impulse, wakeUp);
  }
  applyTorqueImpulse(torque: Vec3Like, wakeUp = true): void {
    this.body.applyTorqueImpulse(torque, wakeUp);
  }
  setLinvel(velocity: Vec3Like, wakeUp = true): void {
    this.body.setLinvel(velocity, wakeUp);
  }
  setAngvel(velocity: Vec3Like, wakeUp = true): void {
    this.body.setAngvel(velocity, wakeUp);
  }
  setTranslation(p: Vec3Like, wakeUp = true): void {
    this.body.setTranslation(p, wakeUp);
  }
  setRotation(q: QuatLike, wakeUp = true): void {
    this.body.setRotation(q, wakeUp);
  }
  wakeUp(): void {
    this.body.wakeUp();
  }
  reset(position?: Vec3Like, rotation?: QuatLike): void {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (position) this.body.setTranslation(position, true);
    if (rotation) this.body.setRotation(rotation, true);
  }
}

/** Collider de um {@link BodySpec} (forma + restituição/atrito/sensor). */
export function colliderDescFor(spec: BodySpec): RAPIER.ColliderDesc {
  const R = rapier();
  const s = spec.shape;
  let c: RAPIER.ColliderDesc;
  if (s.kind === 'box') c = R.ColliderDesc.cuboid(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z);
  else if (s.kind === 'ball') c = R.ColliderDesc.ball(s.radius);
  else c = R.ColliderDesc.capsule(s.halfHeight, s.radius);
  if (spec.restitution != null) c.setRestitution(spec.restitution);
  if (spec.friction != null) c.setFriction(spec.friction);
  if (spec.isSensor) c.setSensor(true);
  return c;
}

/** Índices 0..n−1 de uma malha sem índice, num laço (sem array JS intermediário). */
function sequentialIndices(n: number): Uint32Array {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/**
 * Chama `add(vértices, índices)` para cada malha de `obj`, com a geometria em
 * espaço-mundo. Pula outlines e nós sem geometria.
 */
export function forEachWorldTrimesh(obj: Object3D, add: (verts: Float32Array, indices: Uint32Array) => void): void {
  obj.updateWorldMatrix(true, true);
  const v = new Vector3();
  obj.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.userData['cortexOutline'] === true) return;
    if (!(mesh as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes['position'];
    if (!pos) return;
    const verts = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      verts[i * 3] = v.x;
      verts[i * 3 + 1] = v.y;
      verts[i * 3 + 2] = v.z;
    }
    // Typed → typed, sem array JS no meio: no Hermes o `Uint32Array.from` montava um array do tamanho
    // da malha e estourava o heap do export com ~1,2 M vértices de rua + terreno (SPEC-0661).
    const idx = mesh.geometry.index;
    add(verts, idx ? new Uint32Array(idx.array) : sequentialIndices(pos.count));
  });
}
