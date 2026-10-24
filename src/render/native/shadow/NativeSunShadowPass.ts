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
 *   over: `autoUpdate` goes false and this pass redraws instead), or when the `?parityFreeze` arm
 *   flipped (so the same-run parity compares the C++ map against the three's);
 * - three arm or any refusal (no mirror, no GPU texture yet, gate): `needsUpdate = true` and the
 *   three draws as before — the worst case is not gaining the redraw, never losing the shadow.
 *
 * `?nativeShadowPass=0` turns it off (the three draws the map); `?nativeShadowPassShift=1` shifts
 * the map by SHIFT_TEXELS — the known-answer case: the parity must FAIL.
 */
import { Matrix4, Vector3, type Camera, type Object3D } from 'three';
import { debug } from '../../../core/debug.js';
import { activeSceneMirror } from '../../../core/NativeSceneMirror.js';
import { CasterGeometryRegistry } from '../../CasterGeometryRegistry.js';
import { mainPassArm } from '../../MainPassArm.js';
import { queryFlagRequested } from '../../TransformOnlyRefresh.js';

const MAT4_FLOATS = 16;
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
  private readonly _viewProj = new Matrix4();
  private readonly _viewProj64 = new Float64Array(MAT4_FLOATS);
  /** This pass took an `autoUpdate` shadow over: it redraws every frame. */
  private _ownsAuto = false;
  private _arm = mainPassArm.three;
  private _lastReport = '';

  constructor(
    private readonly _host: BackendHost,
    private readonly _shift = queryFlagRequested('nativeShadowPassShift=', false),
  ) {}

  /** Once per frame, before the three's `ShadowNode.updateBefore`. */
  update(light: SunLight, scene: unknown, _camera: unknown): void {
    const shadow = light.shadow;
    if (shadow.autoUpdate) {
      this._ownsAuto = true;
      shadow.autoUpdate = false;
    }
    const flipped = mainPassArm.three !== this._arm;
    this._arm = mainPassArm.three;
    if (!shadow.needsUpdate && !this._ownsAuto && !flipped) return;
    const why = mainPassArm.three ? 'braco-three' : this._draw(light, scene as Object3D);
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
    shadow.updateMatrices(light);
    const cam = shadow.camera;
    this._viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const vp = this._viewProj64;
    const e = this._viewProj.elements;
    for (let i = 0; i < MAT4_FLOATS; i++) vp[i] = e[i]!;
    if (this._shift) shiftClipX(vp, (NDC_SPAN * PASS_SHIFT_TEXELS) / shadow.mapSize.x);
    const r = mirror.drawShadowPass(cam, NO_CAMERA, NO_MIN_RATIO, vp, target, NODES_NOT_MEASURED, false);
    if (!r) return 'sem-ponte';
    if (r.refused || r.drawn === 0) return `${r.reason}${r.counts ? ` [${r.counts}]` : ''}`;
    return null;
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
