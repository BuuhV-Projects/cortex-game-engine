/**
 * Lights block of the native renderer (group 1, bindings 0–7; R1.2, SPEC-0535): the sun, the
 * hemisphere and up to 8 spot lights of the view in ONE uniform buffer, written once per frame.
 * Turning a light on/off changes a value, never a shader variant.
 *
 * The data is what the three's `DynamicLighting` (SPEC-0435) feeds its shaders, ported from the
 * WGSL it generates for the DDD 61 (R0 reference dump) and from `SpotLightDataNode` /
 * `HemisphereLightDataNode`: sun = shadow-casting directional (world position and target), sky
 * and ground × intensity, spots in view space with cutoff distance, decay and cone cosines.
 *
 * Light list: the core calls `update` at the start of the projection, before the three collects
 * the frame's lights, so the block scans the scene itself — only when the scene changes (another
 * root, or another child count of the root) — and filters visibility and layers per frame.
 * ponytail: rescans on root changes only; a light added deep in the tree after the first frame is
 * missed until then. Upgrade path: the core hands the projection's lights to the block.
 *
 * A light the models cannot reproduce makes `lightsRefusal()` non-null: models refuse new objects.
 */
import { Vector3, type Camera, type Color, type Object3D, type Scene } from 'three';
import type { FrameBlock, FrameBlockFactory } from './FrameBlock.js';

export const LIGHTS_FIRST_BINDING = 0;
export const LIGHTS_LAST_BINDING = 7;

/** Same caps as the three's `DynamicLighting` in the host (`DynamicLightingSwitch.ts`). */
export const MAX_SPOT_LIGHTS = 8;
const MAX_HEMISPHERE_LIGHTS = 1;
const MAX_DIRECTIONAL_LIGHTS = 1;

const ROW_FLOATS = 4;
const HEADER_ROWS = 6;
const SPOT_ARRAYS = 4;
/** Floats of the uniform block (see the WGSL struct below). */
export const LIGHTS_FLOATS = (HEADER_ROWS + SPOT_ARRAYS * MAX_SPOT_LIGHTS) * ROW_FLOATS;
const FLOAT_BYTES = 4;
const W = 3;

/** Float offsets of the block (rows of 4). */
export const LIGHTS_LAYOUT = {
  sunColor: 0,
  spotCount: W,
  sunPosition: ROW_FLOATS,
  hemiCount: ROW_FLOATS + W,
  sunTarget: 2 * ROW_FLOATS,
  hemiSky: 3 * ROW_FLOATS,
  hemiGround: 4 * ROW_FLOATS,
  hemiDirection: 5 * ROW_FLOATS,
  spotPositionCutoff: HEADER_ROWS * ROW_FLOATS,
  spotColor: (HEADER_ROWS + MAX_SPOT_LIGHTS) * ROW_FLOATS,
  spotDirectionDecay: (HEADER_ROWS + 2 * MAX_SPOT_LIGHTS) * ROW_FLOATS,
  spotCone: (HEADER_ROWS + 3 * MAX_SPOT_LIGHTS) * ROW_FLOATS,
} as const;

const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const STAGE_FRAGMENT = 0x2;
/** Sun direction when there is no sun: any non-zero vector (normalize(0) is NaN), color 0. */
const NO_SUN_UP = 1;

const LIGHTS_WGSL = /* wgsl */ `
struct NativeLights {
  sunColor : vec3<f32>,
  spotCount : u32,
  sunPosition : vec3<f32>,
  hemiCount : u32,
  sunTarget : vec3<f32>,
  hemiSky : vec3<f32>,
  hemiGround : vec3<f32>,
  hemiDirection : vec3<f32>,
  spotPositionCutoff : array<vec4<f32>, ${MAX_SPOT_LIGHTS}>,
  spotColor : array<vec4<f32>, ${MAX_SPOT_LIGHTS}>,
  spotDirectionDecay : array<vec4<f32>, ${MAX_SPOT_LIGHTS}>,
  spotCone : array<vec4<f32>, ${MAX_SPOT_LIGHTS}>,
};
@group(1) @binding(${LIGHTS_FIRST_BINDING}) var<uniform> lights : NativeLights;

/** Sun direction in view space (the three's DirectionalLightNode: view * (position - target)). */
fn nativeSunDirection() -> vec3<f32> {
  return normalize((view.view * vec4<f32>(lights.sunPosition - lights.sunTarget, 0.0)).xyz);
}

/** Hemisphere irradiance (the three's loop resets it per light: only the last one counts). */
fn nativeHemiIrradiance(normalView : vec3<f32>) -> vec3<f32> {
  if (lights.hemiCount == 0u) {
    return vec3<f32>(0.0);
  }
  let normalWorld = normalize((vec4<f32>(normalView, 0.0) * view.view).xyz);
  return mix(lights.hemiGround, lights.hemiSky, (dot(normalWorld, lights.hemiDirection) * 0.5) + 0.5);
}

struct NativeSpotLight {
  direction : vec3<f32>,
  color : vec3<f32>,
};

/** Spot i at a view-space position: light direction and attenuated color (SpotLightDataNode). */
fn nativeSpot(i : u32, positionView : vec3<f32>) -> NativeSpotLight {
  let positionCutoff = lights.spotPositionCutoff[i];
  let directionDecay = lights.spotDirectionDecay[i];
  let lightVector = positionCutoff.xyz - positionView;
  let direction = normalize(lightVector);
  var attenuation : f32;
  if (positionCutoff.w > 0.0) {
    let distance = length(lightVector);
    let ratio = distance / positionCutoff.w;
    let falloff = clamp(1.0 - (((ratio * ratio) * ratio) * ratio), 0.0, 1.0);
    attenuation = (1.0 / max(pow(distance, directionDecay.w), 0.01)) * (falloff * falloff);
  } else {
    attenuation = 1.0 / max(pow(length(lightVector), directionDecay.w), 0.01);
  }
  let cone = lights.spotCone[i];
  let color = (lights.spotColor[i].xyz * vec3<f32>(smoothstep(cone.x, cone.y, dot(direction, directionDecay.xyz)))) * vec3<f32>(attenuation);
  return NativeSpotLight(direction, color);
}
`;

interface LightLike extends Object3D {
  isLight?: boolean;
  isDirectionalLight?: boolean;
  isHemisphereLight?: boolean;
  isSpotLight?: boolean;
  color: Color;
  groundColor?: Color;
  intensity: number;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  map?: unknown;
  colorNode?: unknown;
  target?: Object3D;
}

let refusal: string | null = null;

/** Why the frame's lights cannot be drawn by the native models (`null` = they can). */
export function lightsRefusal(): string | null {
  return refusal;
}

function visible(light: Object3D, camera: Camera): boolean {
  if (!light.layers.test(camera.layers)) return false;
  for (let o: Object3D | null = light; o !== null; o = o.parent) if (!o.visible) return false;
  return true;
}

function byId(a: Object3D, b: Object3D): number {
  return a.id - b.id;
}

/** What makes a light impossible for the models; `null` = drawable. */
function unsupported(light: LightLike): string | null {
  if (light.isDirectionalLight || light.isHemisphereLight) return null;
  if (light.isSpotLight) return light.castShadow || light.map || light.colorNode ? 'spotShadow' : null;
  return light.type;
}

const _position = new Vector3();
const _target = new Vector3();

function writeVec3(out: Float32Array, at: number, v: Vector3): void {
  out[at] = v.x;
  out[at + 1] = v.y;
  out[at + 2] = v.z;
}

function writeColor(out: Float32Array, at: number, c: Color, intensity: number): void {
  out[at] = c.r * intensity;
  out[at + 1] = c.g * intensity;
  out[at + 2] = c.b * intensity;
}

export class LightsBlock implements FrameBlock {
  readonly name = 'lights';
  readonly version = 0;
  readonly wgsl = LIGHTS_WGSL;
  /** The block as written to the GPU (also what the tests read). */
  readonly data = new Float32Array(LIGHTS_FLOATS);
  private readonly _counts = new Uint32Array(this.data.buffer);
  private readonly _buffer: unknown;
  private _scene: Scene | null = null;
  private _rootChildren = -1;
  private _lights: LightLike[] = [];
  private readonly _spots: LightLike[] = [];

  constructor(private readonly _device: { createBuffer(d: unknown): unknown; queue: { writeBuffer(b: unknown, o: number, d: ArrayBufferView): void } }) {
    this._buffer = _device.createBuffer({ label: 'native.lights', size: LIGHTS_FLOATS * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
  }

  layoutEntries(): unknown[] {
    return [{ binding: LIGHTS_FIRST_BINDING, visibility: STAGE_FRAGMENT, buffer: { type: 'uniform' } }];
  }

  resources(): unknown[] {
    return [{ binding: LIGHTS_FIRST_BINDING, resource: { buffer: this._buffer } }];
  }

  update(sceneArg: unknown, cameraArg: unknown): void {
    const scene = sceneArg as Scene;
    const camera = cameraArg as Camera;
    if (scene !== this._scene || scene.children.length !== this._rootChildren) this._scan(scene);
    const d = this.data;
    const L = LIGHTS_LAYOUT;
    d.fill(0);
    d[L.sunPosition + 1] = NO_SUN_UP;
    let why: string | null = scene.environment ? 'environment' : null;
    let suns = 0;
    let hemis = 0;
    const spots = this._spots;
    spots.length = 0;
    const all = this._lights;
    for (let i = 0; i < all.length; i++) {
      const light = all[i]!;
      if (!visible(light, camera)) continue;
      why ??= unsupported(light);
      if (light.isDirectionalLight) {
        if (++suns > MAX_DIRECTIONAL_LIGHTS) why ??= 'directional';
        writeColor(d, L.sunColor, light.color, light.intensity);
        writeVec3(d, L.sunPosition, _position.setFromMatrixPosition(light.matrixWorld));
        writeVec3(d, L.sunTarget, _target.setFromMatrixPosition(light.target!.matrixWorld));
      } else if (light.isHemisphereLight && hemis < MAX_HEMISPHERE_LIGHTS) {
        hemis++;
        writeColor(d, L.hemiSky, light.color, light.intensity);
        writeColor(d, L.hemiGround, light.groundColor!, light.intensity);
        writeVec3(d, L.hemiDirection, _position.setFromMatrixPosition(light.matrixWorld).normalize());
      } else if (light.isSpotLight && spots.length < MAX_SPOT_LIGHTS) {
        spots.push(light);
      }
    }
    for (let i = 0; i < spots.length; i++) this._writeSpot(i, spots[i]!, camera);
    this._counts[L.spotCount] = spots.length;
    this._counts[L.hemiCount] = hemis;
    refusal = why === null ? null : `lights:${why}`;
    this._device.queue.writeBuffer(this._buffer, 0, d);
  }

  private _scan(scene: Scene): void {
    this._scene = scene;
    this._rootChildren = scene.children.length;
    const found: LightLike[] = [];
    scene.traverse((o) => {
      if ((o as LightLike).isLight) found.push(o as LightLike);
    });
    this._lights = found.sort(byId);
  }

  /** SpotLightDataNode.update, same calls: position/direction in view space, cutoff, decay, cone. */
  private _writeSpot(i: number, light: LightLike, camera: Camera): void {
    const d = this.data;
    const L = LIGHTS_LAYOUT;
    const at = i * ROW_FLOATS;
    writeVec3(d, L.spotPositionCutoff + at, _position.setFromMatrixPosition(light.matrixWorld).applyMatrix4(camera.matrixWorldInverse));
    d[L.spotPositionCutoff + at + W] = light.distance!;
    writeColor(d, L.spotColor + at, light.color, light.intensity);
    _position.setFromMatrixPosition(light.matrixWorld);
    _target.setFromMatrixPosition(light.target!.matrixWorld);
    writeVec3(d, L.spotDirectionDecay + at, _position.sub(_target).transformDirection(camera.matrixWorldInverse));
    d[L.spotDirectionDecay + at + W] = light.decay!;
    d[L.spotCone + at] = Math.cos(light.angle!);
    d[L.spotCone + at + 1] = Math.cos(light.angle! * (1 - light.penumbra!));
  }
}

export const createLightsBlock: FrameBlockFactory = (device) => new LightsBlock(device as ConstructorParameters<typeof LightsBlock>[0]);
