/**
 * BVH em JS só para a malha que o host não reproduz (SPEC-0729): com a ponte nativa, o coletor do personagem não
 * monta a árvore da malha roteável (as mesmas regras do `route`); sem a ponte, tudo continua como antes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  Vector3,
} from 'three';
import { CharacterSceneCollector } from '../../src/physics/characterCollect.js';
import { firstHitAmong, nativeRoutable, setNativeRaycastBridge, type RaycastBridge } from '../../src/physics/nativeRaycast.js';

const OUT_DISTANCE = 0;
const OUT_INSTANCE = 7;
/** Segmentos por lado: 6 × 10² × 2 = 1.200 triângulos, acima do corte do `ensureBoundsTree`. */
const SEGMENTS = 10;
/** O raio sai de z = 10 para baixo: a face de cima da caixa unitária na origem fica a 9,5 m. */
const RAY_START_Z = 10;
const TOP_FACE_DISTANCE = 9.5;
const NATIVE_DISTANCE = 9.25;

/** Ponte falsa: conta os registros; `first` responde a candidata 0 a {@link NATIVE_DISTANCE}. */
function fakeBridge() {
  let nextId = 0;
  const calls = { addGeometry: 0, addInstances: 0, first: [] as number[] };
  const bridge: RaycastBridge = {
    addGeometry: () => (calls.addGeometry++, { id: nextId++ }),
    addInstances: () => (calls.addInstances++, { id: nextId++ }),
    setInstances: () => true,
    first(_ray, n, _slots, _m, _e, out) {
      calls.first.push(n);
      out[OUT_DISTANCE] = NATIVE_DISTANCE;
      out[OUT_INSTANCE] = -1;
      return 0;
    },
  };
  return { bridge, calls };
}

/** No export o `matrixWorld.elements` é um Float64Array sobre o espelho (SPEC-0234). */
function float64World(o: Object3D): void {
  o.updateMatrixWorld(true);
  o.matrixWorld.elements = Float64Array.from(o.matrixWorld.elements) as unknown as Matrix4['elements'];
}

function box(material: MeshBasicMaterial | MeshBasicMaterial[] = new MeshBasicMaterial()): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1, SEGMENTS, SEGMENTS, SEGMENTS), material);
  float64World(m);
  return m;
}

function hasTree(o: Object3D): boolean {
  return Boolean((o as Mesh).geometry.boundsTree);
}

function collect(...meshes: Object3D[]): CharacterSceneCollector {
  const root = new Object3D();
  for (const m of meshes) root.add(m);
  const c = new CharacterSceneCollector();
  c.collect([root]);
  return c;
}

function rayDown(): Raycaster {
  return new Raycaster(new Vector3(0, 0, RAY_START_Z), new Vector3(0, 0, -1));
}

/** Malhas que o host não reproduz, cada uma por uma regra do `route`. */
function unroutables(): Record<string, Mesh> {
  const float64 = box();
  const pos = float64.geometry.attributes['position'] as BufferAttribute;
  float64.geometry.setAttribute('position', new BufferAttribute(Float64Array.from(pos.array), pos.itemSize));
  const multi = box([new MeshBasicMaterial()]);
  multi.geometry.groups.length = 0;
  multi.geometry.addGroup(0, Infinity, 0);
  const wrapped = box();
  const raycast = wrapped.raycast.bind(wrapped);
  wrapped.raycast = (r, out) => raycast(r, out);
  const float32World = new Mesh(new BoxGeometry(1, 1, 1, SEGMENTS, SEGMENTS, SEGMENTS), new MeshBasicMaterial());
  return { float64, multi, wrapped, float32World };
}

describe('nativeRoutable (SPEC-0729)', () => {
  afterEach(() => setNativeRaycastBridge(undefined));

  it('sem a ponte: false, e o collect monta a árvore da visível e da escondida', () => {
    setNativeRaycastBridge(null);
    const visible = box();
    const hidden = box();
    hidden.visible = false;
    expect(nativeRoutable(visible)).toBe(false);
    const c = collect(visible, hidden);
    expect(c.groundMeshes).toEqual([visible]);
    expect(hasTree(visible)).toBe(true);
    expect(hasTree(hidden)).toBe(true);
  });

  it('com a ponte: a malha roteável não ganha árvore, nem visível nem escondida', () => {
    const { bridge, calls } = fakeBridge();
    setNativeRaycastBridge(bridge);
    const visible = box();
    const hidden = box();
    hidden.visible = false;
    const c = collect(visible, hidden);
    expect(c.groundMeshes).toEqual([visible]);
    expect(hasTree(visible)).toBe(false);
    expect(hasTree(hidden)).toBe(false);
    expect(calls.addGeometry).toBe(2); // registradas no host já na coleta
  });

  it('com a ponte: a malha que o host não reproduz ganha a árvore', () => {
    setNativeRaycastBridge(fakeBridge().bridge);
    for (const [name, mesh] of Object.entries(unroutables())) {
      expect(nativeRoutable(mesh), name).toBe(false);
      collect(mesh);
      expect(hasTree(mesh), name).toBe(true);
    }
  });

  it('InstancedMesh roteável registra as instâncias e fica sem árvore', () => {
    const { bridge, calls } = fakeBridge();
    setNativeRaycastBridge(bridge);
    const im = new InstancedMesh(new BoxGeometry(1, 1, 1, SEGMENTS, SEGMENTS, SEGMENTS), new MeshBasicMaterial(), 2);
    float64World(im);
    expect(nativeRoutable(im)).toBe(true);
    expect(calls.addInstances).toBe(1);
    collect(im);
    expect(hasTree(im)).toBe(false);
  });

  it('o raio acerta igual: a roteável vai pro host sem registrar de novo', () => {
    const { bridge, calls } = fakeBridge();
    setNativeRaycastBridge(bridge);
    const m = box();
    collect(m);
    const hit = firstHitAmong(rayDown(), [m], null);
    expect(calls.first).toEqual([1]);
    expect(calls.addGeometry).toBe(1);
    expect(hit?.object).toBe(m);
    expect(hit?.distance).toBe(NATIVE_DISTANCE);
  });

  it('o raio acerta igual: a não roteável pelo JS, com ou sem a ponte', () => {
    setNativeRaycastBridge(fakeBridge().bridge);
    const multi = unroutables()['multi']!;
    collect(multi);
    expect(firstHitAmong(rayDown(), [multi], null)?.distance).toBeCloseTo(TOP_FACE_DISTANCE);
    setNativeRaycastBridge(null);
    const plain = box();
    collect(plain);
    expect(firstHitAmong(rayDown(), [plain], null)?.distance).toBeCloseTo(TOP_FACE_DISTANCE);
  });
});
