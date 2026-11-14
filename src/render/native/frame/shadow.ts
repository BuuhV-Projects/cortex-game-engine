/**
 * Sun shadow block of the native renderer (group 1, bindings 8–15; R1.3, SPEC-0545): the sun's
 * shadow map and its PCFSoft parameters once per view, never per material (SPEC-0445/0475 — as
 * Godot's directional light buffer, `light_data_inc.glsl:72-87`).
 *
 * - The map is the three's `light.shadow.map.depthTexture` (found by identity through the
 *   backend). When it has to be redrawn, `NativeSunShadowPass` draws it in the C++ shadow pass
 *   (part 2); otherwise the three's `ShadowNode` does, as before.
 * - `update` runs at projection time, BEFORE the three's `ShadowNode.updateBefore` (draw time):
 *   on a redraw frame the block calls `shadow.updateMatrices` itself (what `renderShadow` does),
 *   so the matrix it writes matches the map drawn later in the same frame.
 * - `nativeShadow` is the three 0.184 PCFSoft (`wgsl-0019`, lambert+fog+receiveShadow) with
 *   `textureSampleCompareLevel`: same result on a mip-less depth map, and no uniformity rule
 *   (the three turns the diagnostic off at the module top, which a block cannot do).
 * - With a CSM on the sun (SPEC-0690, `shadowCsm.ts`) the block drives it: `updateNative` once per
 *   frame (cascade placement + C++ draw), then one matrix and one map per cascade. The sun itself has
 *   no map then: neither its `updateMatrices` nor `NativeSunShadowPass` run.
 * - The WGSL (`shadowWgsl.ts`, SPEC-0732) only has the cascades the CSM uses; more cascades recompile it.
 *
 * `?nativeShadow=0` disables the sampling (lit); `?nativeShadowShift=1` shifts the native
 * receivers' sampling by SHIFT_TEXELS — the known-answer case: the parity must FAIL.
 */
import { PCFSoftShadowMap } from 'three';
import { debug } from '../../../core/debug.js';
import { beginSection, endSection } from '../../RenderSections.js';
import { queryFlagRequested } from '../../TransformOnlyRefresh.js';
import type { NativeRendererHost } from '../NativeRenderer.js';
import type { FrameBlockFactory } from './FrameBlock.js';
import { NativeSunShadowPass, nativeShadowPassRequested, type SunLight } from '../shadow/NativeSunShadowPass.js';
import { flushCsmReceivers } from './csmReceiverCount.js';
import {
  SHADOW_BIAS_AT, SHADOW_ENABLED_AT, SHADOW_INTENSITY_AT, SHADOW_MAP_SIZE_AT, SHADOW_MATRIX_AT, SHADOW_NORMAL_BIAS_AT,
  SHADOW_UV_SHIFT_AT,
} from './shadowLayout.js';
import {
  CSM_COUNT_AT, CSM_MAX_CASCADES, SHADOW_UBO_FLOATS, csmMapLayoutEntries, csmShadowSource, writeCsmParams, writeSingleMapMode,
  type CsmShadowSource,
} from './shadowCsm.js';
import { SHADOW_MAP_BINDING, SHADOW_PARAMS_BINDING, SHADOW_SAMPLER_BINDING, shadowWgsl } from './shadowWgsl.js';

export {
  SHADOW_BIAS_AT, SHADOW_ENABLED_AT, SHADOW_FIRST_BINDING, SHADOW_INTENSITY_AT, SHADOW_LAST_BINDING, SHADOW_MAP_SIZE_AT,
  SHADOW_MATRIX_AT, SHADOW_NORMAL_BIAS_AT, SHADOW_PARAM_FLOATS, SHADOW_UV_SHIFT_AT,
} from './shadowLayout.js';
export { SHADOW_UBO_FLOATS } from './shadowCsm.js';
/** `true` once `nativeShadow` samples the real shadow map. */
export const SHADOW_READY = true;

const PARAMS_BINDING = SHADOW_PARAMS_BINDING;
const SAMPLER_BINDING = SHADOW_SAMPLER_BINDING;
const MAP_BINDING = SHADOW_MAP_BINDING;
const MAT4_FLOATS = 16;
const FLOAT_BYTES = 4;
/** Frames between scene searches for a shadow-casting sun while none is found. */
const LIGHT_RESCAN_FRAMES = 120;
/** Seção do perfil de render (SPEC-0585): o bloco inteiro, com a CSM nativa que ele dirige (SPEC-0690). */
const SECTION_SHADOW_BLOCK = 'shadowBlock';
/** Known-answer shift (`?nativeShadowShift=1`), in shadow-map texels. */
export const SHIFT_TEXELS = 8;

const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const TEXTURE_BINDING = 0x04;
const TEXTURE_RENDER_ATTACHMENT = 0x10;
const STAGE_VERTEX = 0x1;
const STAGE_FRAGMENT = 0x2;
/** Bound until the three's map has a GPU texture (the group needs a resource). */
const EMPTY_MAP_SIDE = 1;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gpu = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface SceneLike {
  traverse(visit: (o: unknown) => void): void;
}

/** The renderer fields the block reads (the host IS the three renderer). */
interface ShadowRenderer {
  shadowMap?: { enabled: boolean; type: number };
  /** The three's frame counter (`NodeFrame.frameId`): the CSM's per-frame guard against its `updateBefore`. */
  _nodes?: { nodeFrame?: { frameId: number } };
}

function isSun(o: unknown): o is SunLight {
  const l = o as Partial<SunLight> & { isDirectionalLight?: boolean };
  return l.isDirectionalLight === true && l.castShadow === true && l.shadow !== undefined;
}

/** Group-1 shadow block: params UBO + comparison sampler + the sun's depth map (or one per CSM cascade). */
export class ShadowBlock {
  readonly name = 'shadow';
  version = 0;
  /**
   * Cascades the WGSL reads (SPEC-0732): the CSM node's `count`, only ever raised, so a drop (or a few frames without
   * the sun) never recompiles; the shader reads `count` from the UBO and skips the cascades past it.
   */
  private _cascades = 0;
  private _wgsl = shadowWgsl(0);
  private readonly _params: Gpu;
  private readonly _sampler: Gpu;
  private readonly _empty: Gpu;
  private readonly _data = new Float32Array(SHADOW_UBO_FLOATS);
  private readonly _last = new Float32Array(SHADOW_UBO_FLOATS).fill(Number.NaN);
  /** GPU texture per binding 10..15 (index = cascade; index 0 = the single map); `null` = the empty one. */
  private readonly _maps: Gpu[] = new Array(CSM_MAX_CASCADES).fill(null);
  private readonly _next: Gpu[] = new Array(CSM_MAX_CASCADES).fill(null);
  private _light: SunLight | null = null;
  private _scene: unknown = null;
  private _frame = 0;
  private _searchedAt = -LIGHT_RESCAN_FRAMES;
  private _lastReport = '';
  /** This frame wrote the CSM with at least one cascade sampled (the `csmReceivers` count, SPEC-0690). */
  private _csmSampled = false;

  constructor(
    private readonly _device: Gpu,
    private readonly _host: NativeRendererHost,
    private readonly _on = queryFlagRequested('nativeShadow=', true),
    private readonly _shift = queryFlagRequested('nativeShadowShift=', false),
    private readonly _pass: NativeSunShadowPass | null = nativeShadowPassRequested() ? new NativeSunShadowPass(_host) : null,
  ) {
    this._params = _device.createBuffer({ label: 'native.shadow', size: SHADOW_UBO_FLOATS * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
    // Same sampling as the three's shadow DepthTexture: LessEqual, nearest (PCFSoft filters by hand), clamp.
    this._sampler = _device.createSampler({
      label: 'native.shadow',
      compare: 'less-equal',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this._empty = _device.createTexture({
      label: 'native.shadow.empty',
      size: [EMPTY_MAP_SIDE, EMPTY_MAP_SIDE],
      format: 'depth32float',
      usage: TEXTURE_BINDING | TEXTURE_RENDER_ATTACHMENT,
    });
  }

  /** WGSL of the block for the cascades compiled so far (SPEC-0732). */
  get wgsl(): string {
    return this._wgsl;
  }

  /** Changes with `wgsl`: the pipeline store keys its modules by it. */
  get codeKey(): string {
    return `shadow:${this._cascades}`;
  }

  layoutEntries(): unknown[] {
    return [
      { binding: PARAMS_BINDING, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } },
      { binding: SAMPLER_BINDING, visibility: STAGE_FRAGMENT, sampler: { type: 'comparison' } },
      { binding: MAP_BINDING, visibility: STAGE_FRAGMENT, texture: { sampleType: 'depth' } },
      ...csmMapLayoutEntries(STAGE_FRAGMENT),
    ];
  }

  resources(): unknown[] {
    return [
      { binding: PARAMS_BINDING, resource: { buffer: this._params } },
      { binding: SAMPLER_BINDING, resource: this._sampler },
      ...this._maps.map((map, i) => ({ binding: MAP_BINDING + i, resource: (map ?? this._empty).createView() })),
    ];
  }

  update(scene: unknown, camera: unknown): void {
    beginSection(SECTION_SHADOW_BLOCK);
    try {
      this._update(scene, camera);
    } finally {
      endSection(SECTION_SHADOW_BLOCK);
    }
  }

  private _update(scene: unknown, camera: unknown): void {
    this._frame++;
    const d = this._data;
    this._next.fill(null);
    this._csmSampled = false;
    const why = this._write(scene, camera, d);
    d[SHADOW_ENABLED_AT] = why === null ? 1 : 0;
    flushCsmReceivers(why === null && this._csmSampled);
    this._compileCascades(d[CSM_COUNT_AT]!);
    this._bindMaps();
    this._report(why ?? 'amostrando');
    const last = this._last;
    for (let i = 0; i < SHADOW_UBO_FLOATS; i++) {
      if (d[i] !== last[i]) {
        last.set(d);
        this._device.queue.writeBuffer(this._params, 0, d);
        return;
      }
    }
  }

  /** Recompiles the WGSL when the CSM reads more cascades than it has; `version` makes the recipes stale. */
  private _compileCascades(count: number): void {
    if (count <= this._cascades) return;
    this._cascades = count;
    this._wgsl = shadowWgsl(count);
    this.version++;
    debug('perf', `[nativeShadow] wgsl com ${count} cascata(s)`);
  }

  /** Swaps in this frame's map textures; any change rebuilds the group. */
  private _bindMaps(): void {
    let changed = false;
    for (let i = 0; i < CSM_MAX_CASCADES; i++) {
      if (this._next[i] === this._maps[i]) continue;
      this._maps[i] = this._next[i];
      changed = true;
    }
    if (changed) this.version++;
  }

  /** Fills the params of this frame; `null` = sampling, otherwise why the shadow is off. */
  private _write(scene: unknown, camera: unknown, d: Float32Array): string | null {
    writeSingleMapMode(d);
    if (!this._on) return 'desligada';
    const sm = (this._host as unknown as ShadowRenderer).shadowMap;
    if (!sm?.enabled) return 'shadowMap-desligado';
    if (sm.type !== PCFSoftShadowMap) return `tipo:${sm.type}`;
    const light = this._findLight(scene);
    if (light === null) return 'sem-sol';
    const shadow = light.shadow;
    const csm = csmShadowSource(shadow);
    if (csm !== null) return this._writeCsm(csm, scene, camera, d);
    // A redraw happens this frame (three or C++): match the matrix it will use.
    if (shadow.needsUpdate || shadow.autoUpdate) shadow.updateMatrices(light);
    this._pass?.update(light, scene, camera);
    const depth = shadow.map?.depthTexture;
    const gpu = depth ? (this._host.backend.get(depth)['texture'] ?? null) : null;
    // ponytail: no own DepthTexture; while the three never created its map there is no shadow (R1.6 adds it).
    if (gpu === null) return 'mapa-sem-gpu';
    this._next[0] = gpu;
    const m = shadow.matrix.elements;
    for (let i = 0; i < MAT4_FLOATS; i++) d[SHADOW_MATRIX_AT + i] = m[i]!;
    d[SHADOW_NORMAL_BIAS_AT] = shadow.normalBias;
    d[SHADOW_BIAS_AT] = shadow.bias;
    this._writeShared(d, shadow.mapSize.x, shadow.mapSize.y, shadow.intensity);
    return null;
  }

  /** CSM mode (SPEC-0690): the node repositions and draws its cascades, then each one goes to its binding. */
  private _writeCsm(csm: CsmShadowSource, scene: unknown, camera: unknown, d: Float32Array): string | null {
    csm.updateNative(camera, scene, this._host, this._frameId());
    const state = csm.nativeReceiverState();
    const why = writeCsmParams(state, d, this._next);
    this._writeShared(d, state.mapWidth, state.mapHeight, state.intensity);
    this._csmSampled = why === null;
    return why;
  }

  /** Fields both modes read: map size, intensity and the known-answer shift. */
  private _writeShared(d: Float32Array, width: number, height: number, intensity: number): void {
    d[SHADOW_MAP_SIZE_AT] = width;
    d[SHADOW_MAP_SIZE_AT + 1] = height;
    d[SHADOW_INTENSITY_AT] = intensity;
    d[SHADOW_UV_SHIFT_AT] = this._shift ? SHIFT_TEXELS / width : 0;
    d[SHADOW_UV_SHIFT_AT + 1] = 0;
  }

  /**
   * The frame for the CSM's per-frame guard: the three's `NodeFrame.frameId`, the same number its `updateBefore`
   * sees; the block's own count where the host has no node frame (no three `updateBefore` to guard against).
   */
  private _frameId(): number {
    return (this._host as unknown as ShadowRenderer)._nodes?.nodeFrame?.frameId ?? this._frame;
  }

  /** The scene's shadow-casting DirectionalLight, cached; searched again every LIGHT_RESCAN_FRAMES while missing. */
  private _findLight(scene: unknown): SunLight | null {
    const known = this._light;
    if (known !== null && this._scene === scene && known.castShadow && known.parent !== null) return known;
    this._light = null;
    if (this._scene === scene && this._frame - this._searchedAt < LIGHT_RESCAN_FRAMES) return null;
    this._scene = scene;
    this._searchedAt = this._frame;
    let found: SunLight | null = null;
    (scene as SceneLike).traverse((o) => {
      if (found === null && isSun(o)) found = o;
    });
    this._light = found;
    return found;
  }

  private _report(state: string): void {
    if (state === this._lastReport) return;
    this._lastReport = state;
    debug('perf', `[nativeShadow] ${state}`);
  }
}

export const createShadowBlock: FrameBlockFactory = (device, host) => new ShadowBlock(device, host);
