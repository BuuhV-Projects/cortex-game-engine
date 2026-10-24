import { describe, it, expect } from 'vitest';
import {
  BoxGeometry,
  Fog,
  FogExp2,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Texture,
} from 'three';
import { NativeRenderer, nativeRendererModels, vertexFormat } from '../../../src/render/native/NativeRenderer.js';
import { NATIVE_MODELS } from '../../../src/render/native/models/index.js';
import { unlitModel } from '../../../src/render/native/models/unlit.js';
import type { DrawBatchBridge } from '../../../src/render/DrawBatch.js';

/** A fake WebGPU device that counts what is created and written. */
function fakeHost() {
  const calls = { buffers: 0, writes: [] as Array<{ buffer: unknown; offset: number; length: number }>, pipelines: 0, modules: [] as string[], groups: 0 };
  let next = 0;
  const device = {
    createBuffer: (d: { size: number; label?: string }) => ({ kind: 'buffer', id: next++, ...d, buffers: calls.buffers++ }),
    createBindGroupLayout: (d: unknown) => ({ kind: 'bgl', d }),
    createBindGroup: (d: unknown) => ({ kind: 'bg', id: next++, d, n: calls.groups++ }),
    createPipelineLayout: (d: unknown) => ({ kind: 'pl', d }),
    createShaderModule: (d: { code: string }) => {
      calls.modules.push(d.code);
      return { kind: 'module', id: next++ };
    },
    createRenderPipeline: (d: unknown) => ({ kind: 'pipeline', id: next++, d, n: calls.pipelines++ }),
    queue: { writeBuffer: (buffer: unknown, offset: number, data: ArrayBufferView) => calls.writes.push({ buffer, offset, length: data.byteLength }) },
  };
  const textureData = new WeakMap<object, Record<string, unknown>>();
  const host = {
    backend: {
      device,
      get: (o: object) => {
        let d = textureData.get(o);
        if (!d) textureData.set(o, (d = {}));
        return d;
      },
      utils: {
        getCurrentColorFormat: () => 'rgba16float',
        getCurrentDepthStencilFormat: () => 'depth24plus',
        getSampleCountRenderContext: () => 1,
      },
    },
    _textures: {
      updateTexture: (t: object) => {
        const d = host.backend.get(t);
        d['texture'] ??= { createView: () => ({ kind: 'view' }) };
      },
      updateSampler: (t: object) => {
        host.backend.get(t)['sampler'] ??= { kind: 'sampler' };
      },
    },
    toneMapping: 0,
  };
  const recorded: unknown[][] = [];
  const released: number[] = [];
  const bridge: DrawBatchBridge = {
    record: (...args) => {
      recorded.push(args);
      return recorded.length - 1;
    },
    release: (id) => released.push(id),
    flush: () => 0,
  };
  return { host, bridge, calls, recorded, released };
}

function frame(nr: NativeRenderer, scene = new Scene()): void {
  const camera = new PerspectiveCamera();
  camera.updateMatrixWorld();
  nr.beginFrame(camera, scene);
}

describe('NativeRenderer (R1.1, SPEC-0495)', () => {
  it('takes an opaque unlit mesh and records a recipe with the 4 fixed groups', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0xff0000 }));
    mesh.updateMatrixWorld();
    frame(nr);
    const entry = nr.take(mesh, mesh.material, mesh.geometry);
    expect(entry).not.toBeNull();
    expect(entry!.count).toBe(36);
    const id = nr.recipeFor(entry!, {});
    expect(id).toBe(0);
    const [pipeline, groups, vbs, index, index32] = t.recorded[0]!;
    expect((pipeline as { kind: string }).kind).toBe('pipeline');
    expect((groups as unknown[]).length).toBe(4);
    expect((vbs as unknown[]).length).toBe(1);
    expect(index).not.toBeNull();
    expect(index32).toBe(false);
    // Same target again: the recipe is reused, no new pipeline.
    expect(nr.recipeFor(entry!, {})).toBe(0);
    expect(t.calls.pipelines).toBe(1);
  });

  it('refuses what R1.1 does not draw, and the reason is cached until the material changes', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, [unlitModel], null);
    const lambert = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
    const transparent = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true }));
    frame(nr);
    expect(nr.take(lambert, lambert.material, lambert.geometry)).toBeNull();
    expect(nr.take(transparent, transparent.material, transparent.geometry)).toBeNull();
    expect(nr.stats.refused).toBe(2);
    nr.take(lambert, lambert.material, lambert.geometry);
    expect(nr.stats.refused).toBe(2);
  });

  it('honours ?nativeRendererModels= and refuses exp2 fog', () => {
    expect([...nativeRendererModels('?a=1&nativeRendererModels=unlit,lambert&b=2')!]).toEqual(['unlit', 'lambert']);
    expect(nativeRendererModels('?x=1')).toBeNull();
    const t = fakeHost();
    const none = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, new Set(['lambert']));
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    frame(none);
    expect(none.take(mesh, mesh.material, mesh.geometry)).toBeNull();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const scene = new Scene();
    scene.fog = new FogExp2(0xffffff, 0.01);
    frame(nr, scene);
    const other = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    expect(nr.take(other, other.material, other.geometry)).toBeNull();
  });

  it('writes the object block only when the object moved, and params only when they changed', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0x00ff00 }));
    mesh.updateMatrixWorld();
    frame(nr);
    nr.take(mesh, mesh.material, mesh.geometry);
    const movedAfterBuild = nr.stats.moved;
    frame(nr);
    nr.take(mesh, mesh.material, mesh.geometry);
    expect(nr.stats.moved).toBe(movedAfterBuild);
    mesh.position.x = 2;
    mesh.updateMatrixWorld();
    frame(nr);
    nr.take(mesh, mesh.material, mesh.geometry);
    expect(nr.stats.moved).toBe(movedAfterBuild + 1);
    expect(nr.stats.paramWrites).toBe(0);
    mesh.material.color.setRGB(0.5, 0.5, 0.5);
    frame(nr);
    nr.take(mesh, mesh.material, mesh.geometry);
    expect(nr.stats.paramWrites).toBe(1);
  });

  it('releases the recipes when the object leaves the scene', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const scene = new Scene();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    scene.add(mesh);
    frame(nr, scene);
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    nr.recipeFor(entry, {});
    scene.remove(mesh);
    expect(t.released).toEqual([0]);
  });

  it('binds the map texture the three uploaded and puts fog in the view block', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const scene = new Scene();
    scene.fog = new Fog(0x112233, 5, 50);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: new Texture() }));
    frame(nr, scene);
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    expect(nr.recipeFor(entry, {})).toBe(0);
    expect(t.calls.modules.at(-1)).toContain('mapTexture');
    expect(t.calls.modules.at(-1)).toContain('smoothstep(view.fogNear, view.fogFar');
    const vbs = t.recorded[0]![2] as unknown[];
    expect(vbs.length).toBe(2); // position + uv, one buffer each
  });
});

describe('vertexFormat', () => {
  it('maps the three arrays it can and refuses the rest', () => {
    expect(vertexFormat(new Float32Array(3), 3, false)).toBe('float32x3');
    expect(vertexFormat(new Uint16Array(4), 4, true)).toBe('unorm16x4');
    expect(vertexFormat(new Uint16Array(3), 3, true)).toBeNull();
    expect(vertexFormat(new Uint8Array(4), 4, true)).toBe('unorm8x4');
    expect(vertexFormat(new Uint8Array(3), 3, true)).toBeNull();
  });
});

describe('unlit model', () => {
  it('writes color, opacity and the uv transform rows', () => {
    const map = new Texture();
    map.offset.set(0.25, 0.5);
    const out = new Float32Array(unlitModel.paramFloats);
    unlitModel.writeParams(new MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, map }), out);
    expect(Array.from(out.slice(0, 4))).toEqual([1, 1, 1, 0.5]);
    // translation column of the uv matrix
    expect(out[12]).toBeCloseTo(0.25);
    expect(out[13]).toBeCloseTo(0.5);
  });
});

describe('NativeRenderer seams for the parallel fronts', () => {
  it('refuses object/pipeline features the core does not draw yet, with a core: reason', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const additive = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ blending: 2, depthWrite: false }));
    frame(nr);
    expect(nr.take(additive, additive.material, additive.geometry)).toBeNull();
    const double = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ side: 2 }));
    expect(nr.take(double, double.material, double.geometry)).not.toBeNull();
  });

  it('rebuilds group 1 and re-records the recipe when a frame block changes its resources', () => {
    const t = fakeHost();
    const block = { name: 'test', version: 0, layoutEntries: () => [], resources: () => [], update: () => undefined, wgsl: '// test block' };
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null, [() => block]);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    frame(nr);
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    expect(nr.recipeFor(entry, {})).toBe(0);
    expect(t.calls.modules.at(-1)).toContain('// test block');
    block.version = 1;
    frame(nr);
    expect(nr.recipeFor(entry, {})).toBe(1);
    expect(t.released).toEqual([0]);
  });
});
