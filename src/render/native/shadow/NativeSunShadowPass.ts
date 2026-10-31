/**
 * The sun's single shadow map drawn by the C++ shadow pass (R1.3 part 2, SPEC-0545): the CSM path
 * of SPEC-0245 (`drawShadowPass`: caster enumeration + gate + depth-only pass with one shared
 * pipeline — Godot's shared shadow material, `render_forward_clustered.cpp:4223-4253`) driven for
 * one `DirectionalLightShadow` with `needsUpdate`. No new C++: the pass already takes any
 * orthographic camera and the target texture by identity.
 *
 * Why it exists: once every receiver is native, no three object uses the `ShadowNode` and the
 * three stops redrawing the map. Here the map is redrawn when it has to be:
 * - `needsUpdate` (the DDD 61's `SunShadow`), or every frame for an `autoUpdate` shadow (taken
 *   over: `autoUpdate` goes false and this pass redraws instead);
 * - any refusal (no mirror, no GPU texture yet, gate): `needsUpdate = true` and the three draws as
 *   before — the worst case is not gaining the redraw, never losing the shadow.
 *
 * Same-run parity (`?parityFreeze`): the three arm never reaches the native server (the
 * projection hands it no server), so this pass cannot see the arm. In that mode it redraws on
 * every native frame, and a `scene.onAfterRender` hook sets `needsUpdate` back after each render,
 * so the three redraws the map on its own arm: the frames compare the C++ map against the three's.
 * Only while the sun is lit (`intensity > 0`), as the game itself (`SunShadow` redraws only when
 * lit): forcing redraws at night crashed the host on a destroyed texture (SPEC-0545, "Como ficou").
 *
 * `?nativeShadowPass=0` turns it off (the three draws the map); `?nativeShadowPassShift=1` shifts
 * the map by SHIFT_TEXELS — the known-answer case: the parity must FAIL.
 */
import { Matrix4, Vector3, type Camera, type Object3D } from 'three';
import { debug } from '../../../core/debug.js';
import { activeSceneMirror } from '../../../core/NativeSceneMirror.js';
import { CasterGeometryRegistry } from '../../CasterGeometryRegistry.js';
import { ShadowAlphaClipSync } from '../../ShadowAlphaClipSync.js';
import { parityFreezeSeconds } from '../../MainPassArm.js';
import { queryFlagRequested } from '../../TransformOnlyRefresh.js';

const MAT4_FLOATS = 16;
/**
 * `drawShadowPass` matrices: `[viewProj, projection, view]`. The host draws the map with
 * projection and view apart, in the three's float order (`clip = P * ((V * M) * p)`), so the map
 * matches the three's texel by texel (SPEC-0545); hosts that read only 16 keep viewProj.
 */
const PROJECTION_AT = MAT4_FLOATS;
const VIEW_AT = 2 * MAT4_FLOATS;
const PASS_MATRIX_FLOATS = 3 * MAT4_FLOATS;
const MAT4_ROW = 4;
const W_ROW = 3;
/** Known-answer shift (`?nativeShadowPassShift=1`), in shadow-map texels. */
export const PASS_SHIFT_TEXELS = 8;
/** NDC spans 2 units across the map. */
const NDC_SPAN = 2;
/** No angular caster filter: the DDD 61 marks its casters itself (`markShadowCasters`). */
const NO_MIN_RATIO = 0;
/** Scene node count not measured: the gate skips the node-divergence check. */
const NODES_NOT_MEASURED = -1;
const NO_CAMERA = new Vector3();

/** The DirectionalLight fields used by the shadow block and this pass. */
export interface SunLight {
  castShadow: boolean;
  intensity: number;
  parent: unknown;
  shadow: {
    map: { depthTexture: unknown } | null;
    matrix: { elements: ArrayLike<number> };
    camera: Camera;
    mapSize: { x: number; y: number };
    normalBias: number;
    bias: number;
    intensity: number;
    needsUpdate: boolean;
    autoUpdate: boolean;
    updateMatrices(light: unknown): void;
  };
}

interface BackendHost {
  backend: { get(o: unknown): Record<string, unknown> };
}

export function nativeShadowPassRequested(): boolean {
  return queryFlagRequested('nativeShadowPass=', true);
}

export class NativeSunShadowPass {
  /** Redraws this pass made (and frames handed to the three), for tests and the report. */
  readonly stats = { drawn: 0, handedBack: 0 };
  private readonly _registry = new CasterGeometryRegistry();
  /** Alpha-clip casters' texture + UV on the host (SPEC-0642). */
  private readonly _alphaClip = new ShadowAlphaClipSync();
  private readonly _viewProj = new Matrix4();
  private readonly _matrices = new Float64Array(PASS_MATRIX_FLOATS);
  /** This pass took an `autoUpdate` shadow over: it redraws every frame. */
  private _ownsAuto = false;
  private _hooked: unknown = null;
  private _lastReport = '';

  constructor(
    private readonly _host: BackendHost,
    private readonly _shift = queryFlagRequested('nativeShadowPassShift=', false),
    private readonly _parity = parityFreezeSeconds() > 0,
  ) {}

  /** Once per frame, before the three's `ShadowNode.updateBefore`. */
  update(light: SunLight, scene: unknown, _camera: unknown): void {
    const shadow = light.shadow;
    if (shadow.autoUpdate) {
      this._ownsAuto = true;
      shadow.autoUpdate = false;
    }
    const forced = this._parity && light.intensity > 0;
    if (forced) this._hookParity(scene as Object3D, shadow);
    if (!shadow.needsUpdate && !this._ownsAuto && !forced) return;
    const why = this._draw(light, scene as Object3D);
    if (why === null) {
      shadow.needsUpdate = false;
      this.stats.drawn++;
      this._report('ASSUMIU');
    } else {
      shadow.needsUpdate = true;
      this.stats.handedBack++;
      this._report(`DEVOLVEU ao three motivo=${why}`);
    }
  }

  /** Draws the map in C++; `null` = drawn, otherwise the refusal reason. */
  private _draw(light: SunLight, scene: Object3D): string | null {
    const mirror = activeSceneMirror();
    if (!mirror?.installed) return 'sem-espelho';
    const shadow = light.shadow;
    const depth = shadow.map?.depthTexture;
    if (!depth) return 'sem-mapa';
    const backend = this._host.backend;
    const target = backend.get(depth)['texture'];
    // The three creates the GPU texture on its first render into the map.
    if (!target) return 'alvo-sem-gpu';
    this._registry.atualizar(scene, backend, mirror.drainNewGeometries());
    this._alphaClip.sync(mirror, backend);
    shadow.updateMatrices(light);
    const cam = shadow.camera;
    this._viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const m = this._matrices;
    const vp = this._viewProj.elements;
    const p = cam.projectionMatrix.elements;
    const v = cam.matrixWorldInverse.elements;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      m[i] = vp[i]!;
      m[PROJECTION_AT + i] = p[i]!;
      m[VIEW_AT + i] = v[i]!;
    }
    if (this._shift) {
      const dx = (NDC_SPAN * PASS_SHIFT_TEXELS) / shadow.mapSize.x;
      shiftClipX(m.subarray(0, MAT4_FLOATS), dx);
      shiftClipX(m.subarray(PROJECTION_AT, VIEW_AT), dx);
    }
    const r = mirror.drawShadowPass(cam, NO_CAMERA, NO_MIN_RATIO, m, target, NODES_NOT_MEASURED, false);
    if (!r) return 'sem-ponte';
    if (r.refused || r.drawn === 0) return `${r.reason}${r.counts ? ` [${r.counts}]` : ''}`;
    return null;
  }

  /** Parity mode only: after every render the map is due again, so the three arm redraws it. */
  private _hookParity(scene: Object3D, shadow: SunLight['shadow']): void {
    if (this._hooked === scene) return;
    this._hooked = scene;
    const previous = scene.onAfterRender;
    scene.onAfterRender = function onAfterRender(this: Object3D, ...args: Parameters<Object3D['onAfterRender']>): void {
      previous.apply(this, args);
      shadow.needsUpdate = true;
    };
  }

  private _report(line: string): void {
    if (line === this._lastReport) return;
    this._lastReport = line;
    debug('perf', `[nativeSunShadow] ${line}`);
  }
}

/** `viewProj = T(dx, 0, 0) · viewProj` (column-major): moves the drawn map by `dx` in NDC. */
export function shiftClipX(viewProj: Float64Array, dx: number): void {
  for (let col = 0; col < MAT4_ROW; col++) viewProj[col * MAT4_ROW] = viewProj[col * MAT4_ROW]! + dx * viewProj[col * MAT4_ROW + W_ROW]!;
}
