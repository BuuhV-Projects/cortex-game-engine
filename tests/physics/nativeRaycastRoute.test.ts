import { afterEach, describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type Object3D,
} from 'three';
import {
  PreparedCandidates,
  firstHitAmong,
  firstHitPrepared,
  prepareCandidates,
  setNativeRaycastBridge,
  type RaycastBridge,
} from '../../src/physics/nativeRaycast.js';

// SPEC-0347: routing of firstHitAmong when the host bridge exists (fake bridge).

const OUT_DISTANCE = 0;
const OUT_INSTANCE = 7;

/** Fake bridge: records calls; `first` answers `answer` (candidate index, distance, instance). */
function fakeBridge(answer: { k: number; distance: number; instance?: number } | null) {
  let nextId = 0;
  const calls = { addGeometry: 0, addInstances: 0, setInstances: 0, first: [] as number[] };
  const bridge: RaycastBridge = {
    addGeometry: () => (calls.addGeometry++, { id: nextId++ }),
    addInstances: () => (calls.addInstances++, { id: nextId++ }),
    setInstances: () => (calls.setInstances++, true),
    first(_ray, n, _slots, _m, _e, out) {
      calls.first.push(n);
      if (!answer) return -1;
      out[OUT_DISTANCE] = answer.distance;
      out[OUT_INSTANCE] = answer.instance ?? -1;
      return answer.k;
    },
  };
  return { bridge, calls };
}

function box(z: number, material: MeshBasicMaterial | MeshBasicMaterial[] = new MeshBasicMaterial()): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), material);
  m.position.set(0, 0, z);
  m.updateMatrixWorld(true);
  // in the export matrixWorld.elements is a Float64Array over the mirror (SPEC-0234)
  m.matrixWorld.elements = Float64Array.from(m.matrixWorld.elements) as unknown as Matrix4['elements'];
  return m;
}

function rayDown(): Raycaster {
  return new Raycaster(new Vector3(0, 0, 10), new Vector3(0, 0, -1));
}

describe('firstHitAmong com a ponte nativa (SPEC-0347)', () => {
  afterEach(() => setNativeRaycastBridge(undefined));

  it('registra a geometria uma vez e de novo quando a versão muda', () => {
    const { bridge, calls } = fakeBridge({ k: 0, distance: 9.5 });
    setNativeRaycastBridge(bridge);
    const m = box(0);
    const hit = firstHitAmong(rayDown(), [m], null);
    expect(hit?.object).toBe(m);
    expect(hit?.distance).toBe(9.5);
    firstHitAmong(rayDown(), [m], null);
    expect(calls.addGeometry).toBe(1);
    m.geometry.attributes['position']!.needsUpdate = true;
    firstHitAmong(rayDown(), [m], null);
    expect(calls.addGeometry).toBe(2);
  });

  it('material em array vai pelo JS e o menor acerto vence', () => {
    const { bridge, calls } = fakeBridge({ k: 0, distance: 9.9 }); // native says 9.9 on the far box
    setNativeRaycastBridge(bridge);
    const far = box(0);
    const near = box(5, [new MeshBasicMaterial()]);
    near.geometry.groups.length = 0;
    near.geometry.addGroup(0, Infinity, 0);
    const hit = firstHitAmong(rayDown(), [far, near], null);
    expect(calls.first).toEqual([1]); // only the single-material mesh went native
    expect(hit?.object).toBe(near); // JS hit at 4.5 beats the native 9.9
    expect(hit?.distance).toBeCloseTo(4.5);
  });

  it('skip tira a candidata antes da ponte', () => {
    const { bridge, calls } = fakeBridge(null);
    setNativeRaycastBridge(bridge);
    const self = box(5);
    const other = box(0);
    const skip = (o: Object3D): boolean => o === self;
    expect(firstHitAmong(rayDown(), [self, other], null, skip)).toBeNull();
    expect(calls.first).toEqual([1]);
  });

  it('instâncias sobem uma vez e são re-enviadas quando mudam', () => {
    const { bridge, calls } = fakeBridge({ k: 0, distance: 3, instance: 1 });
    setNativeRaycastBridge(bridge);
    const im = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    im.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, 6.5));
    im.updateMatrixWorld(true);
    im.matrixWorld.elements = Float64Array.from(im.matrixWorld.elements) as unknown as Matrix4['elements'];
    expect(firstHitAmong(rayDown(), [im], null)?.instanceId).toBe(1);
    firstHitAmong(rayDown(), [im], null);
    expect(calls.addInstances).toBe(1);
    im.instanceMatrix.needsUpdate = true;
    firstHitAmong(rayDown(), [im], null);
    expect(calls.setInstances).toBe(1);
  });

  it('candidatas preparadas: roteia uma vez e cada raio é uma chamada nativa (SPEC-0646)', () => {
    const { bridge, calls } = fakeBridge({ k: 1, distance: 7 });
    setNativeRaycastBridge(bridge);
    const a = box(0);
    const b = box(2);
    const js = box(5, [new MeshBasicMaterial()]); // array de material: caminho JS
    js.geometry.groups.length = 0;
    js.geometry.addGroup(0, Infinity, 0);
    const ray = rayDown();
    const p = prepareCandidates([a, b, js], ray.layers, new PreparedCandidates());
    expect(p.n).toBe(2);
    expect(p.js).toEqual([js]);
    expect(firstHitPrepared(ray, p)?.object).toBe(js); // JS a 4,5 vence o nativo a 7
    js.position.z = -50;
    js.updateMatrixWorld(true);
    expect(firstHitPrepared(ray, p)?.object).toBe(b);
    expect(calls.first).toEqual([2, 2]);
    expect(calls.addGeometry).toBe(2); // não re-roteia por raio
  });

  it('candidatas preparadas sem a ponte: tudo pelo JS', () => {
    setNativeRaycastBridge(null);
    const near = box(5);
    const p = prepareCandidates([box(0), near], rayDown().layers, new PreparedCandidates());
    expect(p.n).toBe(0);
    expect(firstHitPrepared(rayDown(), p)?.object).toBe(near);
  });
});
