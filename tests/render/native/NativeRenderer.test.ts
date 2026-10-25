import { describe, it, expect } from 'vitest';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  InstancedMesh,
  Fog,
  FogExp2,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  PerspectiveCamera,
  Scene,
  Texture,
} from 'three';
import { NativeRenderer, nativeRendererModels, vertexFormat } from '../../../src/render/native/NativeRenderer.js';
import { NATIVE_MODELS } from '../../../src/render/native/models/index.js';
import { unlitModel } from '../../../src/render/native/models/unlit.js';
import type { DrawBatchBridge } from '../../../src/render/DrawBatch.js';
import {
  Bone,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  RGBAFormat,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Float32BufferAttribute,
} from 'three';
import { registerNativeMaterial } from '../../../src/render/native/GameMaterials.js';
import { drainNativePipelineBirths } from '../../../src/core/PipelineBirthLog.js';
import { SHADER_TIME_ROLLOVER_S, advanceShaderTime, shaderTime } from '../../../src/render/native/ShaderClock.js';
import { VIEW_TIME_AT, type NativeModelDef } from '../../../src/render/native/models/NativeModel.js';

/** A fake WebGPU device that counts what is created and written. */
function fakeHost() {
  const calls = { buffers: 0, writes: [] as Array<{ buffer: unknown; offset: number; length: number; data: ArrayBufferView }>, pipelines: 0, modules: [] as string[], groups: 0 };
  let next = 0;
  const device = {
    createBuffer: (d: { size: number; label?: string }) => ({ kind: 'buffer', id: next++, ...d, buffers: calls.buffers++ }),
    createSampler: (d: unknown) => ({ kind: 'sampler', d }),
    createTexture: (d: unknown) => ({ kind: 'texture', d, createView: () => ({ kind: 'view' }) }),
    createBindGroupLayout: (d: unknown) => ({ kind: 'bgl', d }),
    createBindGroup: (d: unknown) => ({ kind: 'bg', id: next++, d, n: calls.groups++ }),
    createPipelineLayout: (d: unknown) => ({ kind: 'pl', d }),
    createShaderModule: (d: { code: string }) => {
      calls.modules.push(d.code);
      return { kind: 'module', id: next++ };
    },
    createRenderPipeline: (d: unknown) => ({ kind: 'pipeline', id: next++, d, n: calls.pipelines++ }),
    queue: { writeBuffer: (buffer: unknown, offset: number, data: ArrayBufferView) => calls.writes.push({ buffer, offset, length: data.byteLength, data }) },
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
    const transparent = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true, premultipliedAlpha: true }));
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

  it('touches a material texture only when its version moves; a render target texture every frame (SPEC-0585 1a)', () => {
    const t = fakeHost();
    let updates = 0;
    const update = t.host._textures.updateTexture;
    t.host._textures.updateTexture = (tex: object) => {
      updates++;
      update(tex);
    };
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const map = new Texture();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map }));
    const step = (): void => {
      frame(nr);
      nr.take(mesh, mesh.material, mesh.geometry);
    };
    step();
    const groups = t.calls.groups;
    const afterBuild = updates;
    step();
    step();
    expect(updates).toBe(afterBuild);
    map.needsUpdate = true;
    step();
    expect(updates).toBe(afterBuild + 1);
    expect(t.calls.groups).toBe(groups);
    t.host.backend.get(map)['texture'] = { createView: () => ({ kind: 'view2' }) };
    map.needsUpdate = true;
    step();
    expect(t.calls.groups).toBe(groups + 1);
    (map as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture = true;
    t.host.backend.get(map)['texture'] = { createView: () => ({ kind: 'view3' }) };
    step();
    expect(t.calls.groups).toBe(groups + 2);
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
    const coverage = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ alphaToCoverage: true }));
    frame(nr);
    expect(nr.take(coverage, coverage.material, coverage.geometry)).toBeNull();
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

type PipelineDesc = {
  vertex: { buffers: Array<{ stepMode: string; arrayStride: number; attributes: Array<{ shaderLocation: number; format: string }> }> };
  fragment: { targets: Array<{ blend?: { color: { dstFactor: string } } }> };
  primitive: { cullMode: string };
  depthStencil: { depthWriteEnabled: boolean; depthBias?: number; depthBiasSlopeScale?: number };
};

describe('NativeRenderer core (R1.4, SPEC-0555)', () => {
  const lastPipeline = (t: ReturnType<typeof fakeHost>) => (t.recorded.at(-1)![0] as { d: PipelineDesc }).d;

  it('takes the instance count of an InstancedBufferGeometry on a plain Mesh, like the three', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const geometry = new InstancedBufferGeometry().copy(new BoxGeometry() as never);
    geometry.instanceCount = 5;
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.updateMatrixWorld();
    frame(nr);
    expect(nr.take(mesh, mesh.material, mesh.geometry)!.instances).toBe(5);
    geometry.instanceCount = 0;
    frame(nr);
    expect(nr.take(mesh, mesh.material, mesh.geometry)!.instances).toBe(0);
  });

  it('draws an InstancedMesh: per-instance VBs after the geometry, instance applied in nativeLocal, count per frame', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    mesh.setColorAt(0, new Color(1, 0, 0));
    mesh.count = 3;
    mesh.updateMatrixWorld();
    frame(nr);
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    expect(entry.instances).toBe(3);
    nr.recipeFor(entry, {});
    const p = lastPipeline(t);
    // position (geometry) + instanceColor (location 1) + instanceMatrix (locations 2..5)
    expect(p.vertex.buffers.map((b) => b.stepMode)).toEqual(['vertex', 'instance', 'instance']);
    expect(p.vertex.buffers[1]!.attributes[0]).toMatchObject({ shaderLocation: 1, format: 'float32x3' });
    expect(p.vertex.buffers[2]!.attributes.map((a) => a.shaderLocation)).toEqual([2, 3, 4, 5]);
    expect(p.vertex.buffers[2]!.arrayStride).toBe(64);
    const code = t.calls.modules.at(-1)!;
    expect(code).toContain('@location(5) instanceMatrix3');
    expect(code).toContain('nativeInstanceMatrix(vin) * vec4<f32>(vin.position, 1.0)');
    expect(code).toContain('vec4<f32>(in.instanceColor, 1.0) * diffuse');
    mesh.count = 0;
    frame(nr);
    expect(nr.take(mesh, mesh.material, mesh.geometry)!.instances).toBe(0);
    // instanceMatrix.needsUpdate: rewritten in place
    const writes = t.calls.writes.length;
    mesh.instanceMatrix.needsUpdate = true;
    frame(nr);
    nr.take(mesh, mesh.material, mesh.geometry);
    expect(t.calls.writes.slice(writes).some((w) => w.length === 4 * 16 * 4)).toBe(true);
  });

  it('rebuilds when instanceColor appears later (setColorAt creates it lazily)', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2);
    frame(nr);
    const before = nr.take(mesh, mesh.material, mesh.geometry)!;
    mesh.setColorAt(1, new Color(0, 1, 0));
    frame(nr);
    const after = nr.take(mesh, mesh.material, mesh.geometry)!;
    expect(after).not.toBe(before);
    nr.recipeFor(after, {});
    expect(lastPipeline(t).vertex.buffers.length).toBe(3);
  });

  it('builds the three pipeline state: blend only when not opaque, depthWrite, polygonOffset as depth bias', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    frame(nr);
    const draw = (m: MeshBasicMaterial) => {
      const mesh = new Mesh(new BoxGeometry(), m);
      const entry = nr.take(mesh, m, mesh.geometry)!;
      nr.recipeFor(entry, {});
      return { entry, p: lastPipeline(t), code: t.calls.modules.at(-1)! };
    };
    const opaque = draw(new MeshBasicMaterial());
    expect(opaque.p.fragment.targets[0]!.blend).toBeUndefined();
    expect(opaque.code).toContain('diffuse.w = 1.0');
    const normal = draw(new MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
    expect(normal.entry.transparent).toBe(true);
    expect(normal.p.fragment.targets[0]!.blend!.color.dstFactor).toBe('one-minus-src-alpha');
    expect(normal.p.depthStencil.depthWriteEnabled).toBe(false);
    expect(normal.code).not.toContain('diffuse.w = 1.0');
    const additive = draw(new MeshBasicMaterial({ blending: AdditiveBlending }));
    expect(additive.entry.transparent).toBe(false); // opaque list, but blended (like the three)
    expect(additive.p.fragment.targets[0]!.blend!.color.dstFactor).toBe('one');
    const offset = draw(new MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -1 }));
    expect(offset.p.depthStencil).toMatchObject({ depthBias: -1, depthBiasSlopeScale: -4 });
    expect(opaque.p.depthStencil.depthBias).toBeUndefined();
  });

  it('draws a transparent DoubleSide material in two passes, back faces first; opaque DoubleSide in one', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    frame(nr);
    const glass = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true, side: DoubleSide }));
    const entry = nr.take(glass, glass.material, glass.geometry)!;
    expect(entry.passes).toBe(2);
    nr.recipeFor(entry, {}, 0);
    expect(lastPipeline(t).primitive.cullMode).toBe('front');
    nr.recipeFor(entry, {}, 1);
    expect(lastPipeline(t).primitive.cullMode).toBe('back');
    const single = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true, side: DoubleSide, forceSinglePass: true }));
    expect(nr.take(single, single.material, single.geometry)!.passes).toBe(1);
    const opaque = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ side: DoubleSide }));
    const e = nr.take(opaque, opaque.material, opaque.geometry)!;
    expect(e.passes).toBe(1);
    nr.recipeFor(e, {});
    expect(lastPipeline(t).primitive.cullMode).toBe('none');
  });

  it('follows drawRange and attribute versions per frame (tire marks), and rebuilds on material.version', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const geo = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(4 * 3 * 3), 3);
    geo.setAttribute('position', pos);
    geo.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
    geo.setDrawRange(0, 0);
    const mat = new MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true });
    const mesh = new Mesh(geo, mat);
    frame(nr);
    expect(nr.take(mesh, mat, geo)!.count).toBe(0);
    geo.setDrawRange(0, 6);
    pos.needsUpdate = true;
    const writes = t.calls.writes.length;
    frame(nr);
    const entry = nr.take(mesh, mat, geo)!;
    expect(entry).toMatchObject({ count: 6, first: 0, triangles: 2 });
    expect(t.calls.writes.slice(writes).some((w) => w.length === pos.array.byteLength)).toBe(true);
    geo.setDrawRange(3, Infinity);
    frame(nr);
    expect(nr.take(mesh, mat, geo)).toMatchObject({ count: 9, first: 3 });
    mat.depthWrite = true;
    mat.needsUpdate = true;
    frame(nr);
    const rebuilt = nr.take(mesh, mat, geo)!;
    expect(rebuilt).not.toBe(entry);
    nr.recipeFor(rebuilt, {});
    expect(lastPipeline(t).depthStencil.depthWriteEnabled).toBe(true);
  });

  it("keeps the three's GPU copy of a rewritten attribute coherent (the sky dome stayed stale in the three)", () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const geo = new BoxGeometry();
    const colors = new BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3), 3);
    geo.setAttribute('color', colors);
    const mesh = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true }));
    const threeCopy = { kind: 'three-buffer' };
    t.host.backend.get(colors)['buffer'] = threeCopy;
    frame(nr);
    nr.take(mesh, mesh.material, geo);
    colors.needsUpdate = true;
    frame(nr);
    nr.take(mesh, mesh.material, geo);
    expect(t.calls.writes.filter((w) => w.buffer === threeCopy).length).toBe(1);
    // A source the three never uploaded gets no extra write.
    const pos = geo.getAttribute('position') as BufferAttribute;
    pos.needsUpdate = true;
    const before = t.calls.writes.length;
    frame(nr);
    nr.take(mesh, mesh.material, geo);
    expect(t.calls.writes.length - before).toBe(1 + 1 + 1); // view block + lights block (R1.2) + our position buffer
  });

  it('unlit: alphaTest discards after opacity, its value is in the params block', () => {
    const code = unlitModel.wgsl(['alpha', 'alphaTest', 'map']);
    expect(code).toContain('diffuse.w = diffuse.w * params.opacity;');
    expect(code.indexOf('params.opacity')).toBeLessThan(code.indexOf('discard'));
    const out = new Float32Array(unlitModel.paramFloats);
    unlitModel.writeParams(new MeshBasicMaterial({ alphaTest: 0.5 }), out);
    expect(out[16]).toBeCloseTo(0.5);
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    frame(nr);
    const cutout = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: new Texture(), alphaTest: 0.5, side: DoubleSide }));
    expect(nr.take(cutout, cutout.material, cutout.geometry)).not.toBeNull();
  });
});

describe('NativeRenderer R1.5 (SPEC-0565): game WGSL, shader clock, skinning', () => {
  type Layout = { d: { entries: Array<{ binding: number; visibility: number; buffer?: { type: string }; sampler?: { type: string }; texture?: { sampleType: string } }> } };
  const lastPipeline = (t: ReturnType<typeof fakeHost>) =>
    (t.recorded.at(-1)![0] as { d: { layout: { d: { bindGroupLayouts: Layout[] } }; vertex: { buffers: Array<{ stepMode: string; attributes: Array<{ shaderLocation: number; format: string }> }> } } }).d;
  const STAGE_BOTH = 3;

  /** A game WGSL with its own per-instance attribute and a float DataTexture read in the VS. */
  const data = new DataTexture(new Float32Array(4 * 2), 2, 1, RGBAFormat, FloatType);
  const waveModel: NativeModelDef = {
    name: 'ignored',
    paramFloats: 4,
    attributeTypes: { tint: 'vec3<f32>' },
    variant: () => [],
    attributes: () => ['position', 'tint'],
    wgsl: () => `
@group(2) @binding(2) var data : texture_2d<f32>;
@vertex fn vs(vin : VIn) -> @builtin(position) vec4<f32> {
  let p = nativeLocal(vin) + textureLoad(data, vec2<i32>(i32(vin.instance), 0), 0) * sin(view.time);
  return view.projection * (view.view * nativeModel(vin)) * p;
}
@fragment fn fs() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }`,
    writeParams: (_m, out) => out.fill(0),
    textures: () => [data],
  };
  registerNativeMaterial('testWave', waveModel);

  const waveMesh = () => {
    const geo = new BoxGeometry();
    geo.setAttribute('tint', new InstancedBufferAttribute(new Float32Array(2 * 3), 3));
    const m = new MeshBasicMaterial();
    m.userData['nativeMaterial'] = 'testWave';
    return new InstancedMesh(geo, m, 2);
  };

  it('draws a registered game material: own instance attribute, float DataTexture visible in the VS', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    frame(nr);
    const mesh = waveMesh();
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    expect(entry).not.toBeNull();
    nr.recipeFor(entry, {});
    const p = lastPipeline(t);
    expect(p.vertex.buffers[1]).toMatchObject({ stepMode: 'instance', attributes: [{ shaderLocation: 1, format: 'float32x3' }] });
    expect(t.calls.modules.at(-1)).toContain('@location(1) tint : vec3<f32>');
    const material = p.layout.d.bindGroupLayouts[2]!.d.entries;
    expect(material[1]).toMatchObject({ visibility: STAGE_BOTH, sampler: { type: 'non-filtering' } });
    expect(material[2]).toMatchObject({ visibility: STAGE_BOTH, texture: { sampleType: 'unfilterable-float' } });
  });

  it('refuses an unregistered or filtered-out game material, and an attribute without a type', () => {
    const t = fakeHost();
    const unlitOnly = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, new Set(['unlit']));
    frame(unlitOnly);
    const mesh = waveMesh();
    expect(unlitOnly.take(mesh, mesh.material, mesh.geometry)).toBeNull();
    const games = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, new Set(['unlit', 'wgsl']));
    frame(games);
    expect(games.take(mesh, mesh.material, mesh.geometry)).not.toBeNull();
    const other = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    other.material.userData['nativeMaterial'] = 'notRegistered';
    expect(games.take(other, other.material, other.geometry)).toBeNull();
    registerNativeMaterial('untyped', { ...waveModel, attributeTypes: {} });
    const untyped = waveMesh();
    untyped.material.userData['nativeMaterial'] = 'untyped';
    expect(games.take(untyped, untyped.material, untyped.geometry)).toBeNull();
  });

  it('writes the shader clock into view.time; the clock wraps at the rollover', () => {
    shaderTime.value = 0;
    advanceShaderTime(1.5);
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    frame(nr);
    const view = t.calls.writes.find((w) => w.length === 40 * 4)!.data as Float32Array;
    expect(view[VIEW_TIME_AT]).toBeCloseTo(1.5);
    advanceShaderTime(SHADER_TIME_ROLLOVER_S);
    expect(shaderTime.value).toBeCloseTo(1.5);
    shaderTime.value = 0;
  });

  /** Two-bone SkinnedMesh like a glTF rig (uint16 joints, float weights). */
  const skinned = (skeleton?: Skeleton) => {
    const geo = new BoxGeometry();
    const n = geo.getAttribute('position').count;
    geo.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    geo.setAttribute('skinWeight', new Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
    const mesh = new SkinnedMesh(geo, new MeshBasicMaterial());
    const bones = [new Bone(), new Bone()];
    bones[0]!.add(bones[1]!);
    mesh.add(bones[0]!);
    mesh.bind(skeleton ?? new Skeleton(bones));
    mesh.updateMatrixWorld(true);
    return mesh;
  };

  it('skins in the core: skinIndex/skinWeight in VIn, bones in group 3, skeleton updated once per frame', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const a = skinned();
    const b = skinned(a.skeleton);
    let updates = 0;
    const update = a.skeleton.update.bind(a.skeleton);
    a.skeleton.update = () => {
      updates++;
      update();
    };
    frame(nr);
    const entry = nr.take(a, a.material, a.geometry)!;
    nr.take(b, b.material, b.geometry);
    expect(updates).toBe(1);
    nr.recipeFor(entry, {});
    const p = lastPipeline(t);
    expect(p.layout.d.bindGroupLayouts[3]!.d.entries[1]).toMatchObject({ binding: 1, buffer: { type: 'read-only-storage' } });
    expect(p.vertex.buffers.flatMap((v) => v.attributes.map((x) => x.format))).toContain('uint16x4');
    const code = t.calls.modules.at(-1)!;
    expect(code).toContain('skinIndex : vec4<u32>');
    expect(code).toContain('(skin.bones[i.x] * w.x) * v');
    const skinBytes = (2 + 2) * 16 * 4;
    const writes = t.calls.writes.length;
    frame(nr);
    nr.take(a, a.material, a.geometry);
    expect(t.calls.writes.slice(writes).some((w) => w.length === skinBytes)).toBe(true);
    expect(updates).toBe(2);
  });

  it('refuses skinned + instanced (the three does not draw both), and reads integer skin formats', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    frame(nr);
    const both = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2);
    (both as unknown as { isSkinnedMesh: boolean }).isSkinnedMesh = true;
    expect(nr.take(both, both.material, both.geometry)).toBeNull();
    expect(vertexFormat(new Uint16Array(4), 4, false)).toBe('uint16x4');
    expect(vertexFormat(new Uint8Array(4), 4, false)).toBe('uint8x4');
    // what the three leaves in skinIndex.array after its own upload
    expect(vertexFormat(new Uint32Array(4), 4, false)).toBe('uint32x4');
  });
});

describe('NativeRenderer R1.6 (SPEC-0585): pipeline births', () => {
  it('records each born pipeline once, with object, material and key, for the trace', () => {
    drainNativePipelineBirths();
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'glass' }));
    mesh.name = 'shop';
    mesh.updateMatrixWorld();
    frame(nr);
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    nr.recipeFor(entry, {});
    nr.recipeFor(entry, {});
    const born = drainNativePipelineBirths();
    expect(born).toHaveLength(1);
    expect(born[0]).toMatchObject({ object: 'shop', material: 'glass', transparent: false, camera: 'main' });
    expect(born[0]!.key.startsWith('unlit|')).toBe(true);
    expect(nr.stats.pipelineMs).toBeGreaterThanOrEqual(0);
  });
});

describe('NativeRenderer.precompile (SPEC-0585)', () => {
  it('builds the recipes of meshes never offered: a hidden pool, both passes of a transparent DoubleSide', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const scene = new Scene();
    const offered = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const pool = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0x00ff00, fog: false }), 4);
    pool.visible = false;
    const glass = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true, side: DoubleSide }));
    const hiddenMaterial = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ visible: false, transparent: true }));
    scene.add(offered, pool, glass, hiddenMaterial);
    scene.updateMatrixWorld();
    const camera = new PerspectiveCamera();
    // No main pass yet: nothing to compile against.
    expect(nr.precompile(scene, camera.layers)).toBe(0);
    frame(nr, scene);
    nr.recipeFor(nr.take(offered, offered.material, offered.geometry)!, {});
    const recipes = nr.stats.recipes;
    expect(nr.precompile(scene, camera.layers)).toBe(3);
    expect(nr.stats.recipes - recipes).toBe(3);
    // Everything is warm: a second warm-up and the real draws create nothing.
    expect(nr.precompile(scene, camera.layers)).toBe(0);
    const entry = nr.take(glass, glass.material, glass.geometry)!;
    nr.recipeFor(entry, {}, 1);
    expect(t.calls.pipelines).toBe(4);
  });

  it('keeps the warm-up refusals out of the report and the cache: a mesh offered later is counted then', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const scene = new Scene();
    const offered = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const toon = new Mesh(new BoxGeometry(), new MeshToonMaterial());
    toon.visible = false;
    scene.add(offered, toon);
    scene.updateMatrixWorld();
    const camera = new PerspectiveCamera();
    frame(nr, scene);
    nr.recipeFor(nr.take(offered, offered.material, offered.geometry)!, {});
    // The warm-up frame offers the revealed mesh, then the sweep reaches it again.
    nr.warmup(() => {
      expect(nr.take(toon, toon.material, toon.geometry)).toBeNull();
      nr.precompile(scene, camera.layers);
    });
    expect(nr.stats.refused).toBe(0);
    expect(nr.take(toon, toon.material, toon.geometry)).toBeNull();
    expect(nr.stats.refused).toBe(1);
  });
});
