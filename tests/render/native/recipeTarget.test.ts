import { describe, it, expect } from 'vitest';
import { BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { NativeRenderer } from '../../../src/render/native/NativeRenderer.js';
import { NATIVE_MODELS } from '../../../src/render/native/models/index.js';
import { NO_TARGET, RecipeTarget } from '../../../src/render/native/NativeRecipeTarget.js';
import type { DrawBatchBridge } from '../../../src/render/DrawBatch.js';
import type { Inst } from '../../../src/render/native/nativeRendererShared.js';

// SPEC-0685: o alvo da receita é lido uma vez por lista; as receitas escolhidas não mudam.

interface Ctx { color: string; depth: string; samples: number }
interface PipelineDesc { fragment: { targets: Array<{ format: string }> }; depthStencil: { format: string }; multisample: { count: number }; primitive: { cullMode: string } }

const CANVAS_MSAA = 4;
const FRAMES = 6;
/** Quadro em que o material troca de grupo (generation) e quadro em que o grupo 1 é refeito. */
const MATERIAL_CHANGE_FRAME = 2;
const FRAME_GROUP_CHANGE_FRAME = 4;

const canvas = (): Ctx => ({ color: 'bgra8unorm', depth: 'depth24plus', samples: CANVAS_MSAA });
const renderTarget = (): Ctx => ({ color: 'rgba16float', depth: 'depth24plus', samples: 1 });
const msaaTarget = (): Ctx => ({ color: 'rgba16float', depth: 'depth32float', samples: CANVAS_MSAA });

/** Host falso: os `utils` leem o alvo do próprio contexto e contam as leituras. */
function fakeHost() {
  let next = 0;
  const reads = { n: 0 };
  const make = (kind: string) => (d: unknown) => ({ kind, id: next++, d, createView: () => ({ kind: 'view' }) });
  const device = {
    createBuffer: make('buffer'), createSampler: make('sampler'), createTexture: make('texture'),
    createBindGroupLayout: make('bgl'), createBindGroup: make('bg'), createPipelineLayout: make('pl'),
    createShaderModule: make('module'), createRenderPipeline: make('pipeline'),
    queue: { writeBuffer: () => undefined },
  };
  const data = new WeakMap<object, Record<string, unknown>>();
  const get = (o: object) => {
    let d = data.get(o);
    if (!d) data.set(o, (d = {}));
    return d;
  };
  const host = {
    backend: {
      device, get,
      utils: {
        getCurrentColorFormat: (c: Ctx) => (reads.n++, c.color),
        getCurrentDepthStencilFormat: (c: Ctx) => (reads.n++, c.depth),
        getSampleCountRenderContext: (c: Ctx) => (reads.n++, c.samples),
      },
    },
    _textures: { updateTexture: (t: object) => void (get(t)['texture'] ??= { createView: () => ({}) }), updateSampler: () => undefined },
    toneMapping: 0,
  };
  const recorded: PipelineDesc[] = [];
  const released: number[] = [];
  const bridge: DrawBatchBridge = {
    record: (pipeline) => recorded.push((pipeline as { d: PipelineDesc }).d) - 1,
    release: (id) => released.push(id),
    flush: () => 0,
  };
  return { host, bridge, recorded, released, reads };
}

function frame(nr: NativeRenderer): void {
  const camera = new PerspectiveCamera();
  camera.updateMatrixWorld();
  nr.beginFrame(camera, new Scene());
}

function meshes(): Mesh[] {
  return [
    new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0xff0000 })),
    new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true, side: DoubleSide })),
    new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0x00ff00 })),
  ];
}

const describePipeline = (d: PipelineDesc) =>
  `${d.fragment.targets[0]!.format}|${d.depthStencil.format}|${d.multisample.count}|${d.primitive.cullMode}`;

/**
 * Roda o mesmo roteiro (vários quadros, listas em canvas, RT e RT com MSAA, dois passes, troca de
 * `mat.generation` e do grupo 1). `legacy`: o caminho antigo — contexto novo a cada chamada e o atalho
 * apagado, então cada `recipeFor` relê os três formatos, monta a string e faz o `Map.get`.
 */
function run(legacy: boolean) {
  const t = fakeHost();
  const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
  const objects = meshes();
  const lists = [renderTarget(), canvas(), msaaTarget()];
  const ids: number[] = [];
  for (let f = 0; f < FRAMES; f++) {
    frame(nr);
    if (f === FRAME_GROUP_CHANGE_FRAME) (nr as unknown as { _frameGeneration: number })._frameGeneration++;
    for (const ctx of lists) {
      if (!legacy) nr.beginList(ctx);
      for (const m of objects) {
        const inst = nr.take(m, m.material, m.geometry) as Inst;
        if (f === MATERIAL_CHANGE_FRAME && ctx === lists[0] && m === objects[0]) inst.mat.generation++;
        for (let p = 0; p < inst.passes; p++) {
          if (legacy) inst.passTarget.fill(NO_TARGET);
          ids.push(nr.recipeFor(inst, legacy ? { ...ctx } : ctx, p));
        }
      }
    }
  }
  const keys = objects.map((m) => [...(nr.take(m, m.material, m.geometry) as Inst).recipes.keys()].sort());
  return { ids, recorded: t.recorded.map(describePipeline), released: t.released, keys, reads: t.reads.n, recipes: nr.stats.recipes };
}

describe('NativeRenderer recipe target (SPEC-0685)', () => {
  it('picks the same recipes as the legacy per-call path (canvas, render target, MSAA, two passes)', () => {
    const fast = run(false);
    const legacy = run(true);
    expect(fast.ids).toEqual(legacy.ids);
    expect(fast.recorded).toEqual(legacy.recorded);
    expect(fast.released).toEqual(legacy.released);
    expect(fast.keys).toEqual(legacy.keys);
    expect(fast.recipes).toBe(legacy.recipes);
    // As três formas de alvo foram gravadas, e os dois passes do vidro (frente/verso).
    expect(new Set(fast.recorded)).toContain(`bgra8unorm|depth24plus|${CANVAS_MSAA}|front`);
    expect(new Set(fast.recorded)).toContain('rgba16float|depth24plus|1|back');
    expect(new Set(fast.recorded)).toContain(`rgba16float|depth32float|${CANVAS_MSAA}|back`);
    expect(fast.keys[1]).toContain(`bgra8unorm|depth24plus|${CANVAS_MSAA}|1`);
    // Os invalidadores (mat.generation, grupo 1) regravaram de verdade.
    expect(fast.released.length).toBeGreaterThan(0);
  });

  it('reads the three formats once per list, not per entry and pass', () => {
    const fast = run(false);
    const legacy = run(true);
    const listsPerFrame = 3;
    const formats = 3;
    expect(fast.reads).toBe(FRAMES * listsPerFrame * formats);
    expect(legacy.reads).toBeGreaterThan(fast.reads * 3);
  });

  it('switches to the new target when the same render context changes target between lists', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const m = meshes()[0]!;
    const ctx = renderTarget();
    frame(nr);
    nr.beginList(ctx);
    const first = nr.recipeFor(nr.take(m, m.material, m.geometry)!, ctx);
    ctx.color = 'bgra8unorm';
    ctx.samples = CANVAS_MSAA;
    nr.beginList(ctx);
    const second = nr.recipeFor(nr.take(m, m.material, m.geometry)!, ctx);
    expect(second).not.toBe(first);
    expect(describePipeline(t.recorded[second]!)).toBe(`bgra8unorm|depth24plus|${CANVAS_MSAA}|back`);
    // De volta ao alvo antigo: a receita dele, guardada no Map, sem gravar outra.
    ctx.color = 'rgba16float';
    ctx.samples = 1;
    nr.beginList(ctx);
    expect(nr.recipeFor(nr.take(m, m.material, m.geometry)!, ctx)).toBe(first);
    expect(t.recorded.length).toBe(2);
  });

  it('rereads the target on a new frame even without beginList', () => {
    const t = fakeHost();
    const nr = new NativeRenderer(t.host as never, t.bridge, NATIVE_MODELS, null);
    const m = meshes()[0]!;
    const ctx = renderTarget();
    frame(nr);
    nr.recipeFor(nr.take(m, m.material, m.geometry)!, ctx);
    ctx.depth = 'depth32float';
    frame(nr);
    const id = nr.recipeFor(nr.take(m, m.material, m.geometry)!, ctx);
    expect(describePipeline(t.recorded[id]!)).toBe('rgba16float|depth32float|1|back');
  });
});

describe('RecipeTarget', () => {
  it('keeps one id per target key and builds the legacy pass keys', () => {
    const t = fakeHost();
    const target = new RecipeTarget();
    target.use(t.host.backend.utils as never, renderTarget());
    const a = target.id;
    expect(target.key(0)).toBe('rgba16float|depth24plus|1|0');
    expect(target.key(1)).toBe('rgba16float|depth24plus|1|1');
    target.use(t.host.backend.utils as never, canvas());
    expect(target.id).not.toBe(a);
    expect(target.key(0)).toBe(`bgra8unorm|depth24plus|${CANVAS_MSAA}|0`);
    target.use(t.host.backend.utils as never, renderTarget());
    expect(target.id).toBe(a);
    target.reset();
    expect(target.context).not.toBe(null);
    expect(target.context).not.toBeUndefined();
  });
});
