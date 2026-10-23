import { describe, it, expect } from 'vitest';
import { Mesh, MeshLambertMaterial, BoxGeometry, Object3D, InstancedMesh } from 'three';
import {
  CheckResult,
  RenderServer,
  buildServerInstance,
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
  emitted: number[][];
}

function batch(withRecipe = true): Batch {
  const b: Batch = {
    emitted: [],
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

describe('RenderServer — offer and emission', () => {
  it('emits after the background and renderOrder < 0, before the other opaque items, in one block', () => {
    const { server, renderer, b, add, log } = setup();
    const renderList = { opaque: [] as unknown[] };
    server.beginProjection(renderer, renderList);
    const a = add('a');
    const c = add('c');
    expect(server.offer(a, a.material, a.geometry, null)).toBe(true);
    expect(server.offer(c, c.material, c.geometry, null)).toBe(true);
    const offScene = new Mesh(); // background: not in the scene graph
    offScene.name = 'bg';
    const sky = new Mesh();
    sky.name = 'sky';
    sky.renderOrder = -1;
    new Object3D().add(sky);
    const other = new Mesh();
    other.name = 'other';
    new Object3D().add(other);
    renderList.opaque = [offScene, sky, other].map((object) => ({ object }));
    renderer._renderObjects!(renderList.opaque as never, 'cam', 'scene', 'L');
    expect(log).toEqual(['three:bg', 'three:sky', 'prepare', 'three:other']);
    expect(b.emitted).toEqual([[9, VERTICES, 1, 0, 9, VERTICES, 1, 0]]);
    expect(renderer.info!.render).toEqual({ drawCalls: 2, triangles: (2 * VERTICES) / 3 });
    expect(server.stats.drawn).toBe(2);
  });

  it('without opaque items of the three, emits before the transparents; and refuses dirty', () => {
    const dirty = setup(CheckResult.Dirty);
    const d = dirty.add('d');
    dirty.server.beginProjection(dirty.renderer, { opaque: [] });
    expect(dirty.server.offer(d, d.material, d.geometry, null)).toBe(false);
    expect(dirty.server.stats.refused).toBe(1);

    const { server, renderer, b, add, log } = setup();
    const a = add('a');
    server.beginProjection(renderer, { opaque: [] });
    server.offer(a, a.material, a.geometry, null);
    renderer._renderTransparents!([], [], 'cam', 'scene', 'L');
    expect(log).toEqual(['prepare', 'transparents']);
    expect(b.emitted.length).toBe(1);
  });

  it('a moved instance gets the transform plan; changed lights go back to the three', () => {
    const moved = setup(CheckResult.Moved);
    const m = moved.add('m');
    const list = { opaque: [] as unknown[] };
    moved.server.beginProjection(moved.renderer, list);
    moved.server.offer(m, m.material, m.geometry, null);
    moved.renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    expect(moved.log).toEqual(['prepare', 'moved']);
    expect(moved.server.stats.moved).toBe(1);

    const { server, renderer, b, add, recs, log } = setup();
    const x = add('x');
    recs.get(x)!.lights = 'other lights';
    const l2 = { opaque: [] as unknown[] };
    server.beginProjection(renderer, l2);
    server.offer(x, x.material, x.geometry, null);
    renderer._renderObjects!(l2.opaque as never, 'cam', 'scene', 'L');
    expect(log).toEqual(['three:x']);
    expect(b.emitted).toEqual([]);
    expect(server.stats.fallback).toBe(1);
  });

  it('a stale shared group (recreated by the three) goes back to the three', () => {
    const { server, renderer, add, log } = setup();
    renderer.backend!.get = (o: unknown) => ((o as { id?: string })?.id === 'shared' ? { group: 'NEW' } : { currentPass: 'P' });
    const a = add('a');
    const list = { opaque: [] as unknown[] };
    server.beginProjection(renderer, list);
    server.offer(a, a.material, a.geometry, null);
    renderer._renderObjects!(list.opaque as never, 'cam', 'scene', 'L');
    expect(log).toEqual(['prepare', 'three:a']);
  });

  it('drops a list projected without a render, and another render does not emit it', () => {
    const { server, renderer, b, add } = setup();
    const a = add('a');
    server.beginProjection(renderer, { opaque: [] });
    server.offer(a, a.material, a.geometry, null);
    renderer._currentRenderContext = {}; // another render: not the owner
    renderer._renderTransparents!([], [], 'cam', 'scene', 'L');
    expect(b.emitted).toEqual([]);
    server.beginProjection(renderer, { opaque: [] });
    expect(server.stats.dropped).toBe(1);
  });
});
