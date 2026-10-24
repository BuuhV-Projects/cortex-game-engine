import { describe, it, expect } from 'vitest';
import { Mesh, MeshLambertMaterial, BoxGeometry, Object3D, InstancedMesh } from 'three';
import {
  CheckResult,
  RenderServer,
  buildServerInstance,
  renderServerRequested,
  type ServerAccess,
  type ServerRecording,
  type ServerRendererLike,
} from '../../src/render/RenderServer.js';

const VERTICES = 36;
/** One shader state for every fake recording (same material type, like the three). */
const STATE = {};

function recording(object: Mesh | InstancedMesh, opts: { instances?: number } = {}): ServerRecording {
  const ro = {
    object,
    geometry: object.geometry,
    camera: null as unknown,
    getNodeBuilderState: () => STATE,
    getBindings: () => [{ id: 'shared' }, { id: 'own' }],
    getDrawParameters: () => ({ vertexCount: VERTICES, firstVertex: 0, instanceCount: opts.instances ?? 1 }),
  };
  return { ro, material: object.material, clipping: null, lights: 'L', envKey: 'E', contextNodeVersion: 0 };
}

interface Batch {
  recipeOf(ro: object): { id: number; grupos: unknown[]; compartilhados: number[] } | undefined;
  emitCommands(pass: unknown, data: unknown, cmds: Int32Array, n: number): void;
  recapture(ro: object): { id: number; grupos: unknown[]; compartilhados: number[] } | undefined;
  /** What a re-record reads as the shared group now. */
  liveShared: string;
  emitted: number[][];
}

function batch(withRecipe = true): Batch {
  const b: Batch = {
    emitted: [],
    liveShared: 'G-shared',
    recapture: () => ({ id: 10, grupos: [b.liveShared, 'G-own'], compartilhados: [0] }),
    recipeOf: () => (withRecipe ? { id: 9, grupos: ['G-shared', 'G-own'], compartilhados: [0] } : undefined),
    emitCommands: (_p, _d, cmds, n) => void b.emitted.push(Array.from(cmds.subarray(0, n * 4))),
  };
  return b;
}

function setup(check: CheckResult = CheckResult.Clean) {
  const b = batch();
  const recs = new Map<object, ServerRecording>();
  const log: string[] = [];
  const access: ServerAccess = {
    recordingOf: (o) => recs.get(o),
    disposed: () => false,
    check: () => check,
    prepareCall: () => void log.push('prepare'),
    envKey: () => 'E',
    applyMoved: () => (log.push('moved'), true),
    batch: b as never,
  };
  const context = {};
  const renderer: ServerRendererLike & { log: string[] } = {
    log,
    _currentRenderContext: context,
    info: { calls: 1, render: { drawCalls: 0, triangles: 0 } },
    contextNode: { version: 0 },
    backend: {
      get: (o: unknown) => ((o as { id?: string })?.id === 'shared' ? { group: 'G-shared' } : { currentPass: 'P' }),
      finishRender: () => void log.push('finish'),
    },
    _currentRenderObjectFunction: (o: unknown) => void log.push(`three:${(o as Object3D).name}`),
    _renderObjects(list) {
      for (const item of list) this._currentRenderObjectFunction!(item.object);
    },
    _renderTransparents: () => void log.push('transparents'),
  };
  const server = new RenderServer(access);
  server.install(renderer);
  const add = (name: string) => {
    const m = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
    m.name = name;
    recs.set(m, recording(m));
    return m;
  };
  return { server, renderer, b, recs, add, log };
}

describe('RenderServer — eligibility', () => {
  it('takes a plain opaque mesh and refuses each exception', () => {
    const b = batch() as never;
    const ok = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
    expect(buildServerInstance(recording(ok), b)).toMatchObject({ count: VERTICES, triangles: VERTICES / 3 });

    const refuse = (mutate: (m: Mesh) => void) => {
      const m = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
      mutate(m);
      return buildServerInstance(recording(m), b);
    };
    expect(refuse((m) => ((m.material as MeshLambertMaterial).transparent = true))).toBeNull();
    expect(refuse((m) => ((m.material as MeshLambertMaterial).depthWrite = false))).toBeNull();
    expect(refuse((m) => ((m.material as MeshLambertMaterial).polygonOffset = true))).toBeNull();
    expect(refuse((m) => ((m.material as MeshLambertMaterial).colorWrite = false))).toBeNull();
    expect(refuse((m) => (m.onBeforeRender = () => undefined))).toBeNull();
    const inst = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), 2);
    expect(buildServerInstance(recording(inst), b)).toBeNull();
    expect(buildServerInstance(recording(ok, { instances: 2 }), b)).toBeNull();
    expect(buildServerInstance(recording(ok), batch(false) as never)).toBeNull();
  });
});

/** A three render item with the `painterSortStable` key. */
function item(object: Object3D, z: number) {
  return { object, z, id: object.id, renderOrder: object.renderOrder, groupOrder: 0 };
}

describe('RenderServer — offer and emission', () => {
  it('interleaves with the three by the sort key, so coplanar depth ties resolve like the three', () => {
    const { server, renderer, b, add, log } = setup();
    const list = { opaque: [] as unknown[] };
    server.beginProjection(renderer, list);
    const near = add('near');
    const far = add('far');
    server.offer(far, far.material, far.geometry, null, 9);
    server.offer(near, near.material, near.geometry, null, 1);
    const mid = new Mesh();
    mid.name = 'mid';
    new Object3D().add(mid);
    list.opaque = [item(mid, 5)];
    renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    expect(log).toEqual(['prepare', 'three:mid']);
    // near (z 1) before mid (z 5), far (z 9) after: two runs, three in between.
    expect(b.emitted).toEqual([[9, VERTICES, 1, 0], [9, VERTICES, 1, 0]]);
    expect(server.stats.drawn).toBe(2);
    expect(server.stats.emissions).toBe(1);
  });

  it('emits after the background and renderOrder < 0, before the other opaque items, in one block', () => {
    const { server, renderer, b, add, log } = setup();
    const renderList = { opaque: [] as unknown[] };
    server.beginProjection(renderer, renderList);
    const a = add('a');
    const c = add('c');
    expect(server.offer(a, a.material, a.geometry, null, 1)).toBe(true);
    expect(server.offer(c, c.material, c.geometry, null, 2)).toBe(true);
    const offScene = new Mesh(); // background: not in the scene graph
    offScene.name = 'bg';
    const sky = new Mesh();
    sky.name = 'sky';
    sky.renderOrder = -1;
    new Object3D().add(sky);
    const other = new Mesh();
    other.name = 'other';
    new Object3D().add(other);
    renderList.opaque = [item(offScene, 0), item(sky, 0), item(other, 5)];
    renderer._renderObjects!(renderList.opaque as never, 'cam', 'scene', 'L');
    // Prepared at the first emission check (once per list), emitted only before `other`.
    expect(log).toEqual(['three:bg', 'prepare', 'three:sky', 'three:other']);
    expect(b.emitted).toEqual([[9, VERTICES, 1, 0, 9, VERTICES, 1, 0]]);
    expect(renderer.info!.render).toEqual({ drawCalls: 2, triangles: (2 * VERTICES) / 3 });
    expect(server.stats.drawn).toBe(2);
  });

  it('without opaque items of the three, emits before the transparents; and refuses dirty', () => {
    const dirty = setup(CheckResult.Dirty);
    const d = dirty.add('d');
    dirty.server.beginProjection(dirty.renderer, { opaque: [] });
    expect(dirty.server.offer(d, d.material, d.geometry, null, 1)).toBe(false);
    expect(dirty.server.stats.refused).toBe(1);

    const { server, renderer, b, add, log } = setup();
    const a = add('a');
    server.beginProjection(renderer, { opaque: [] });
    server.offer(a, a.material, a.geometry, null, 1);
    renderer._renderTransparents!([], [], 'cam', 'scene', 'L');
    expect(log).toEqual(['prepare', 'transparents']);
    expect(b.emitted.length).toBe(1);
  });

  it('a moved instance gets the transform plan; changed lights go back to the three', () => {
    const moved = setup(CheckResult.Moved);
    const m = moved.add('m');
    const list = { opaque: [] as unknown[] };
    moved.server.beginProjection(moved.renderer, list);
    moved.server.offer(m, m.material, m.geometry, null, 1);
    moved.renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    expect(moved.log).toEqual(['prepare', 'moved']);
    expect(moved.server.stats.moved).toBe(1);

    const { server, renderer, b, add, recs, log } = setup();
    const x = add('x');
    recs.get(x)!.lights = 'other lights';
    const l2 = { opaque: [] as unknown[] };
    server.beginProjection(renderer, l2);
    server.offer(x, x.material, x.geometry, null, 1);
    renderer._renderObjects!(l2.opaque as never, 'cam', 'scene', 'L');
    expect(log).toEqual(['three:x']);
    expect(b.emitted).toEqual([]);
    expect(server.stats.fallback).toBe(1);
  });

  it('a recreated shared group re-records the recipe; still stale goes back to the three', () => {
    const { server, renderer, b, add, log } = setup();
    renderer.backend!.get = (o: unknown) => ((o as { id?: string })?.id === 'shared' ? { group: 'NEW' } : { currentPass: 'P' });
    const a = add('a');
    const list = { opaque: [] as unknown[] };
    server.beginProjection(renderer, list);
    server.offer(a, a.material, a.geometry, null, 1);
    renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    expect(log).toEqual(['prepare', 'three:a']); // the re-record still reads the old group
    expect(b.emitted).toEqual([]);

    b.liveShared = 'NEW';
    server.beginProjection(renderer, list);
    server.offer(a, a.material, a.geometry, null, 1);
    renderer.info!.calls = 2;
    renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    expect(b.emitted).toEqual([[10, VERTICES, 1, 0]]);
    expect(server.stats.recaptured).toBe(1);
  });

  it('drops a list projected without a render, and another render does not emit it', () => {
    const { server, renderer, b, add } = setup();
    const a = add('a');
    server.beginProjection(renderer, { opaque: [] });
    server.offer(a, a.material, a.geometry, null, 1);
    renderer._currentRenderContext = {}; // another render: not the owner
    renderer._renderTransparents!([], [], 'cam', 'scene', 'L');
    expect(b.emitted).toEqual([]);
    server.beginProjection(renderer, { opaque: [] });
    expect(server.stats.dropped).toBe(1);
  });
});

describe('RenderServer — default', () => {
  it('is on by default (only the native host installs the path); ?renderServer=0 turns it off', () => {
    const g = globalThis as { location?: { search: string } };
    const before = g.location;
    try {
      g.location = { search: '' };
      expect(renderServerRequested()).toBe(true);
      g.location = { search: '?renderServer=0' };
      expect(renderServerRequested()).toBe(false);
    } finally {
      g.location = before;
    }
  });
});

describe('RenderServer — native entries (ADR-0465, R1.1)', () => {
  it('asks the native renderer first and sorts its entries with the RS1 ones and the three', () => {
    const { server, renderer, b, add, log } = setup();
    const taken = new Set<object>();
    const frames: unknown[] = [];
    server.attachNative({
      beginFrame: (camera) => void frames.push(camera),
      take: (o) => (taken.has(o) ? { count: 6, first: 0, triangles: 2 } : null),
      recipeFor: (entry) => (entry.count === 6 ? 42 : -1),
    });
    const list = { opaque: [] as unknown[] };
    server.beginProjection(renderer, list, 'cam', 'scene');
    expect(frames).toEqual(['cam']);
    const nativeNear = add('nativeNear');
    taken.add(nativeNear);
    const rsFar = add('rsFar');
    expect(server.offer(nativeNear, nativeNear.material, nativeNear.geometry, null, 1)).toBe(true);
    expect(server.offer(rsFar, rsFar.material, rsFar.geometry, null, 9)).toBe(true);
    const mid = new Mesh();
    mid.name = 'mid';
    new Object3D().add(mid);
    list.opaque = [item(mid, 5)];
    renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    // native (z 1) → three (z 5) → RS1 (z 9); the native entry did not touch the b.1 state.
    expect(b.emitted).toEqual([[42, 6, 1, 0], [9, VERTICES, 1, 0]]);
    expect(log).toEqual(['prepare', 'three:mid']);
  });

  it('a native entry without a recipe for the target is drawn by the three at its place', () => {
    const { server, renderer, b, add, log } = setup();
    server.attachNative({ beginFrame: () => undefined, take: () => ({ count: 3, first: 0, triangles: 1 }), recipeFor: () => -1 });
    const list = { opaque: [] as unknown[] };
    server.beginProjection(renderer, list, 'cam', 'scene');
    const m = add('noRecipe');
    expect(server.offerNative(m, m.material, m.geometry, null, 2)).toBe(true);
    renderer._renderTransparents!(null, null, 'cam', 'scene', 'L');
    expect(b.emitted).toEqual([]);
    expect(log).toContain('three:noRecipe');
  });
});
