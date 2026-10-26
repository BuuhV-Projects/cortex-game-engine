/**
 * The runtime UI drawn by the native renderer (R2.1, SPEC-0616, ADR-0615): the `RendererUiBackend` scene
 * read as data (`uiQuads.ts`) and drawn with one pipeline (`uiWgsl.ts`) into an own `rgba16float` target,
 * which the host composites over the game in gamma (`__cortexUiLayer`, ADR-0105).
 *
 * Per frame: one write of the records, one render pass, and per batch one bind group + one instanced
 * draw with the records bound as a per-instance vertex buffer at the batch offset (Godot,
 * `renderer_canvas_render_rd.cpp:3072-3076`). Textures are resolved through `resolveTexture` only when
 * `texture.version` changes.
 *
 * Host only, off by default: `?nativeUi=1`. `?nativeUiTint=1` adds 8/255 to the red (parity known answer).
 */
import type { Camera, Object3D, Texture } from 'three';
import { debug } from '../../../core/debug.js';
import { isNativeHost } from '../../../scene/StaticMerge.js';
import { queryFlagRequested } from '../../TransformOnlyRefresh.js';
import { UiQuadList, UI_QUAD_BYTES, UI_QUAD_FLOATS } from './uiQuads.js';
import { UI_QUAD_VERTICES, UI_VIEW_FLOATS, UI_VIEW_TINT_AT, UI_WGSL, uiInstanceLayout } from './uiWgsl.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gpu = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The GPU texture and sampler of a three texture (uploading it if needed); `null` = not ready. */
export type UiTextureSource = (texture: Texture) => { texture: Gpu; sampler: Gpu } | null;

const QUERY_KEY = 'nativeUi=';
const TINT_QUERY = 'nativeUiTint=';
const TINT_DELTA = 8 / 255;
const TARGET_FORMAT = 'rgba16float';
const WHITE_FORMAT = 'rgba8unorm';
const WHITE_TEXEL = new Uint8Array([255, 255, 255, 255]);
const MAT4_FLOATS = 16;
const FLOAT_BYTES = 4;
/** Frames a replaced target lives on: the frame in flight (and the host composite) may still read it. */
const RETIRE_FRAMES = 2;
/** Frames between reports on `debug('perf')`, plus one early report for short rounds. */
const REPORT_FRAMES = 600;
const EARLY_REPORT_FRAME = 120;

const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_COPY_DST = 0x02;
const TEXTURE_BINDING = 0x04;
const TEXTURE_RENDER_ATTACHMENT = 0x10;
const BUFFER_COPY_DST = 0x08;
const BUFFER_VERTEX = 0x20;
const BUFFER_UNIFORM = 0x40;
const STAGE_VERTEX = 0x1;
const STAGE_FRAGMENT = 0x2;

/** Premultiplied "over" into the target, as `setUiCompositeBlend` (ADR-0105). */
const UI_BLEND = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
} as const;

/** `?nativeUi=1` (off by default until the R2.1 acceptance). */
export function nativeUiRequested(fallback = false): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

interface TextureGroup {
  version: number;
  gpu: Gpu;
  group: Gpu;
}

export class NativeUiRenderer {
  readonly stats = { frames: 0, quads: 0, draws: 0, skipped: 0, uploads: 0 };
  private readonly _quads = new UiQuadList();
  private readonly _view = new Float32Array(UI_VIEW_FLOATS);
  private readonly _viewBuffer: Gpu;
  private readonly _viewGroup: Gpu;
  private readonly _textureLayout: Gpu;
  private readonly _pipeline: Gpu;
  private readonly _white: Gpu;
  private readonly _groups = new WeakMap<Texture, TextureGroup>();
  private _instanceBuffer: Gpu = null;
  private _instanceBytes = 0;
  private _target: Gpu = null;
  private _targetView: Gpu = null;
  private _width = 0;
  private _height = 0;
  private _retired: Array<{ texture: Gpu; frames: number }> = [];

  constructor(
    private readonly _device: Gpu,
    private readonly _resolveTexture: UiTextureSource,
    tint = queryFlagRequested(TINT_QUERY, false),
  ) {
    const d = _device;
    if (tint) this._view[UI_VIEW_TINT_AT] = TINT_DELTA;
    const viewLayout = d.createBindGroupLayout({
      label: 'nativeUi.view',
      entries: [{ binding: 0, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this._textureLayout = d.createBindGroupLayout({
      label: 'nativeUi.texture',
      entries: [
        { binding: 0, visibility: STAGE_FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: STAGE_FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this._viewBuffer = d.createBuffer({ label: 'nativeUi.view', size: UI_VIEW_FLOATS * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
    this._viewGroup = d.createBindGroup({ layout: viewLayout, entries: [{ binding: 0, resource: { buffer: this._viewBuffer } }] });
    const module = d.createShaderModule({ label: 'nativeUi', code: UI_WGSL });
    this._pipeline = d.createRenderPipeline({
      label: 'nativeUi',
      layout: d.createPipelineLayout({ bindGroupLayouts: [viewLayout, this._textureLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [uiInstanceLayout()] },
      fragment: { module, entryPoint: 'fs', targets: [{ format: TARGET_FORMAT, blend: UI_BLEND }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    const white = d.createTexture({ label: 'nativeUi.white', size: [1, 1, 1], format: WHITE_FORMAT, usage: TEXTURE_BINDING | TEXTURE_COPY_DST });
    d.queue.writeTexture({ texture: white }, WHITE_TEXEL, { bytesPerRow: WHITE_TEXEL.length }, [1, 1, 1]);
    this._white = d.createBindGroup({
      layout: this._textureLayout,
      entries: [{ binding: 0, resource: d.createSampler({ label: 'nativeUi.white' }) }, { binding: 1, resource: white.createView() }],
    });
  }

  /**
   * Draws the UI scene into the own target and returns its GPU texture (for `__cortexUiLayer`), or `null`
   * for an empty size.
   */
  render(scene: Object3D, camera: Camera, width: number, height: number): Gpu | null {
    if (width <= 0 || height <= 0) return null;
    this._retire();
    this._ensureTarget(width, height);
    const quads = this._quads;
    quads.build(scene);
    this._writeView(camera);
    this._writeInstances();
    const d = this._device;
    const encoder = d.createCommandEncoder({ label: 'nativeUi' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this._targetView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._viewGroup);
    let draws = 0;
    for (let i = 0; i < quads.batchCount; i++) {
      const batch = quads.batches[i]!;
      const group = batch.texture === null ? this._white : this._textureGroup(batch.texture);
      if (group === null) continue;
      pass.setBindGroup(1, group);
      pass.setVertexBuffer(0, this._instanceBuffer, batch.first * UI_QUAD_BYTES);
      pass.draw(UI_QUAD_VERTICES, batch.count);
      draws++;
    }
    pass.end();
    d.queue.submit([encoder.finish()]);
    this._count(draws);
    return this._target;
  }

  dispose(): void {
    this._target?.destroy?.();
    this._target = null;
    for (const r of this._retired) r.texture.destroy?.();
    this._retired = [];
  }

  private _ensureTarget(width: number, height: number): void {
    if (this._target !== null && width === this._width && height === this._height) return;
    if (this._target !== null) this._retired.push({ texture: this._target, frames: RETIRE_FRAMES });
    this._width = width;
    this._height = height;
    this._target = this._device.createTexture({
      label: 'nativeUi.target',
      size: [width, height, 1],
      format: TARGET_FORMAT,
      usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_BINDING | TEXTURE_COPY_SRC,
    });
    this._targetView = this._target.createView();
  }

  private _retire(): void {
    if (this._retired.length === 0) return;
    for (let i = this._retired.length - 1; i >= 0; i--) {
      const r = this._retired[i]!;
      if (--r.frames > 0) continue;
      r.texture.destroy?.();
      this._retired.splice(i, 1);
    }
  }

  /** Projection + view matrix as the three's camera block (`updateMatrixWorld` as its `render` does). */
  private _writeView(camera: Camera): void {
    if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    const v = this._view;
    const p = camera.projectionMatrix.elements;
    const w = camera.matrixWorldInverse.elements;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      v[i] = p[i]!;
      v[MAT4_FLOATS + i] = w[i]!;
    }
    this._device.queue.writeBuffer(this._viewBuffer, 0, v);
  }

  private _writeInstances(): void {
    const q = this._quads;
    if (q.count === 0) return;
    const bytes = q.count * UI_QUAD_BYTES;
    if (bytes > this._instanceBytes) {
      this._instanceBuffer?.destroy?.();
      this._instanceBytes = bytes * 2;
      this._instanceBuffer = this._device.createBuffer({ label: 'nativeUi.quads', size: this._instanceBytes, usage: BUFFER_VERTEX | BUFFER_COPY_DST });
    }
    this._device.queue.writeBuffer(this._instanceBuffer, 0, q.data, 0, q.count * UI_QUAD_FLOATS);
  }

  /** The bind group of a batch texture; uploads/rebinds only when `texture.version` changed. */
  private _textureGroup(texture: Texture): Gpu | null {
    const known = this._groups.get(texture);
    if (known !== undefined && known.version === texture.version) return known.group;
    const resolved = this._resolveTexture(texture);
    this.stats.uploads++;
    if (resolved === null) return null;
    if (known !== undefined && known.gpu === resolved.texture) {
      known.version = texture.version;
      return known.group;
    }
    const group = this._device.createBindGroup({
      layout: this._textureLayout,
      entries: [{ binding: 0, resource: resolved.sampler }, { binding: 1, resource: resolved.texture.createView() }],
    });
    this._groups.set(texture, { version: texture.version, gpu: resolved.texture, group });
    return group;
  }

  private _count(draws: number): void {
    const s = this.stats;
    s.frames++;
    s.quads = this._quads.count;
    s.draws = draws;
    s.skipped = this._quads.skipped;
    if (s.frames % REPORT_FRAMES === 0 || s.frames === EARLY_REPORT_FRAME) {
      debug('perf', `[nativeUi] frame=${s.frames} quads=${s.quads} draws=${s.draws} skipped=${s.skipped} uploads=${s.uploads}`);
    }
  }
}

/**
 * Builds the native UI renderer on the three WebGPU renderer (device + the three's texture upload, until
 * the native renderer has its own), or `null` off the host, without `?nativeUi=1` or without a device.
 */
export function createNativeUiRenderer(threeRenderer: unknown): NativeUiRenderer | null {
  if (!isNativeHost() || !nativeUiRequested()) return null;
  const r = threeRenderer as {
    backend?: { device?: Gpu; get(o: unknown): Record<string, unknown> };
    _textures?: { updateTexture(t: unknown): void; updateSampler(t: unknown): unknown };
  };
  const backend = r.backend;
  const textures = r._textures;
  if (!backend?.device || !textures) {
    debug('perf', '[nativeUi] sem device/_textures do three: UI fica no three');
    return null;
  }
  debug('perf', '[nativeUi] instalado');
  return new NativeUiRenderer(backend.device, (texture) => {
    textures.updateTexture(texture);
    textures.updateSampler(texture);
    const data = backend.get(texture);
    return data['texture'] && data['sampler'] ? { texture: data['texture'], sampler: data['sampler'] } : null;
  });
}
