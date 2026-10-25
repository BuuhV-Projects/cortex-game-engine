import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectionalLight, PCFShadowMap, PCFSoftShadowMap, Scene } from 'three';

const mirror = {
  installed: true,
  drainNewGeometries: () => [],
  drawShadowPass: vi.fn(),
};
vi.mock('../../../src/core/NativeSceneMirror.js', () => ({ activeSceneMirror: () => mirror }));

import {
  ShadowBlock,
  SHADOW_BIAS_AT,
  SHADOW_ENABLED_AT,
  SHADOW_FIRST_BINDING,
  SHADOW_INTENSITY_AT,
  SHADOW_LAST_BINDING,
  SHADOW_MAP_SIZE_AT,
  SHADOW_MATRIX_AT,
  SHADOW_NORMAL_BIAS_AT,
  SHADOW_PARAM_FLOATS,
  SHADOW_READY,
  SHADOW_UV_SHIFT_AT,
  SHIFT_TEXELS,
} from '../../../src/render/native/frame/shadow.js';
import { NativeSunShadowPass, PASS_SHIFT_TEXELS, shiftClipX, type SunLight } from '../../../src/render/native/shadow/NativeSunShadowPass.js';
import type { NativeRendererHost } from '../../../src/render/native/NativeRenderer.js';

const MAP_SIZE = 2048;
/** Taps of the three's PCFSoft in the reference WGSL (`wgsl-0019`: 16 `textureSampleCompare`). */
const REFERENCE_TAPS = 16;

function fakeHost(type: number = PCFSoftShadowMap) {
  const writes: Float32Array[] = [];
  const data = new WeakMap<object, Record<string, unknown>>();
  const device = {
    createBuffer: (d: unknown) => ({ kind: 'buffer', d }),
    createSampler: (d: unknown) => ({ kind: 'sampler', d }),
    createTexture: (d: unknown) => ({ kind: 'empty', d, createView: () => ({ of: 'empty' }) }),
    queue: { writeBuffer: (_b: unknown, _o: number, a: Float32Array) => writes.push(a.slice()) },
  };
  const host = {
    backend: {
      device,
      get: (o: object) => {
        let d = data.get(o);
        if (!d) data.set(o, (d = {}));
        return d;
      },
    },
    shadowMap: { enabled: true, type },
  };
  return { device, host: host as unknown as NativeRendererHost & typeof host, writes };
}

function sunScene() {
  const scene = new Scene();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(MAP_SIZE, MAP_SIZE);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.intensity = 0.8;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = false;
  scene.add(sun, sun.target);
  scene.updateMatrixWorld();
  return { scene, sun };
}

/** Gives the sun a three shadow map whose GPU texture exists. */
function withMap(host: ReturnType<typeof fakeHost>['host'], sun: DirectionalLight, name = 'map') {
  const depthTexture = { name: 'ShadowDepthTexture' };
  (sun.shadow as unknown as { map: unknown }).map = { depthTexture };
  const gpu = { name, createView: () => ({ of: name }) };
  host.backend.get(depthTexture)['texture'] = gpu;
  return gpu;
}

describe('shadow block (R1.3, SPEC-0545)', () => {
  beforeEach(() => {
    mirror.drawShadowPass.mockReset();
  });

  it('is ready, inside bindings 8–15', () => {
    expect(SHADOW_READY).toBe(true);
    const { device, host } = fakeHost();
    const block = new ShadowBlock(device, host, true, false, null);
    for (const e of block.layoutEntries() as Array<{ binding: number }>) {
      expect(e.binding).toBeGreaterThanOrEqual(SHADOW_FIRST_BINDING);
      expect(e.binding).toBeLessThanOrEqual(SHADOW_LAST_BINDING);
    }
    expect((block.resources() as Array<{ binding: number }>).map((r) => r.binding)).toEqual(
      (block.layoutEntries() as Array<{ binding: number }>).map((e) => e.binding),
    );
  });

  it('writes the sun shadow params once per change and binds the three map', () => {
    const { device, host, writes } = fakeHost();
    const { scene, sun } = sunScene();
    withMap(host, sun);
    const block = new ShadowBlock(device, host, true, false, null);
    const before = block.version;
    block.update(scene, null);
    const d = writes.at(-1)!;
    expect(d.length).toBe(SHADOW_PARAM_FLOATS);
    expect(d[SHADOW_ENABLED_AT]).toBe(1);
    expect(d[SHADOW_NORMAL_BIAS_AT]).toBeCloseTo(0.04);
    expect(d[SHADOW_BIAS_AT]).toBeCloseTo(-0.0004);
    expect(d[SHADOW_MAP_SIZE_AT]).toBe(MAP_SIZE);
    expect(d[SHADOW_INTENSITY_AT]).toBeCloseTo(0.8);
    expect(Array.from(d.slice(SHADOW_MATRIX_AT, SHADOW_MATRIX_AT + 16))).toEqual(Array.from(new Float32Array(sun.shadow.matrix.elements)));
    expect(d[SHADOW_UV_SHIFT_AT]).toBe(0);
    expect(block.version).toBe(before + 1);
    expect((block.resources() as Array<{ resource: unknown }>)[2]!.resource).toEqual({ of: 'map' });
    block.update(scene, null);
    expect(writes.length).toBe(1);
  });

  it('bumps the version when the three recreates the map texture', () => {
    const { device, host } = fakeHost();
    const { scene, sun } = sunScene();
    withMap(host, sun, 'a');
    const block = new ShadowBlock(device, host, true, false, null);
    block.update(scene, null);
    const v = block.version;
    withMap(host, sun, 'b');
    block.update(scene, null);
    expect(block.version).toBe(v + 1);
  });

  it('is off (lit) without sun, map texture, shadowMap or PCFSoft, and when disabled', () => {
    const cases: Array<() => { block: ShadowBlock; scene: Scene; writes: Float32Array[] }> = [
      () => {
        const { device, host, writes } = fakeHost();
        return { block: new ShadowBlock(device, host, true, false, null), scene: new Scene(), writes };
      },
      () => {
        const { device, host, writes } = fakeHost();
        return { block: new ShadowBlock(device, host, true, false, null), scene: sunScene().scene, writes };
      },
      () => {
        const { device, host, writes } = fakeHost(PCFShadowMap);
        const { scene, sun } = sunScene();
        withMap(host, sun);
        return { block: new ShadowBlock(device, host, true, false, null), scene, writes };
      },
      () => {
        const { device, host, writes } = fakeHost();
        host.shadowMap.enabled = false;
        const { scene, sun } = sunScene();
        withMap(host, sun);
        return { block: new ShadowBlock(device, host, true, false, null), scene, writes };
      },
      () => {
        const { device, host, writes } = fakeHost();
        const { scene, sun } = sunScene();
        withMap(host, sun);
        return { block: new ShadowBlock(device, host, false, false, null), scene, writes };
      },
    ];
    for (const make of cases) {
      const { block, scene, writes } = make();
      block.update(scene, null);
      expect(writes.at(-1)![SHADOW_ENABLED_AT]).toBe(0);
      expect((block.resources() as Array<{ resource: unknown }>)[2]!.resource).toEqual({ of: 'empty' });
    }
  });

  it('updates the shadow matrices itself only on a redraw frame (it runs before the three)', () => {
    const { device, host } = fakeHost();
    const { scene, sun } = sunScene();
    withMap(host, sun);
    const spy = vi.spyOn(sun.shadow, 'updateMatrices');
    const block = new ShadowBlock(device, host, true, false, null);
    block.update(scene, null);
    expect(spy).not.toHaveBeenCalled();
    sun.shadow.needsUpdate = true;
    block.update(scene, null);
    expect(spy).toHaveBeenCalledWith(sun);
  });

  it('known-answer shift moves the sampling by SHIFT_TEXELS', () => {
    const { device, host, writes } = fakeHost();
    const { scene, sun } = sunScene();
    withMap(host, sun);
    new ShadowBlock(device, host, true, true, null).update(scene, null);
    expect(writes.at(-1)![SHADOW_UV_SHIFT_AT]).toBeCloseTo(SHIFT_TEXELS / MAP_SIZE);
  });

  it('WGSL is the three PCFSoft: 16 compare taps, mixed by the intensity', () => {
    const { device, host } = fakeHost();
    const wgsl = new ShadowBlock(device, host, true, false, null).wgsl;
    expect(wgsl.match(/nativeShadowTap\(uv/g)!.length).toBe(REFERENCE_TAPS + 1);
    expect(wgsl).toContain('1.0 - ndc.y');
    expect(wgsl).toContain('fract(uv * s.mapSize + vec2<f32>(0.5))');
    expect(wgsl).toContain('mix(1.0, sum * (1.0 / 9.0), s.intensity)');
    expect(wgsl).toMatch(/fn nativeShadow\(positionWorld : vec3<f32>, normalWorld : vec3<f32>\) -> f32/);
  });
});

describe('NativeSunShadowPass (R1.3 part 2, SPEC-0545)', () => {
  const accepted = { drawn: 3, refused: false, reason: 'aceito', totalCasters: 3 };

  beforeEach(() => {
    mirror.drawShadowPass.mockReset();
    mirror.drawShadowPass.mockReturnValue(accepted);
  });

  function setup() {
    const { host } = fakeHost();
    const { scene, sun } = sunScene();
    const target = withMap(host, sun);
    return { host, scene, sun, target, light: sun as unknown as SunLight };
  }

  it('draws the map in C++ on needsUpdate and keeps the three from redrawing it', () => {
    const { host, scene, sun, target, light } = setup();
    const pass = new NativeSunShadowPass(host, false, false);
    pass.update(light, scene, null);
    expect(mirror.drawShadowPass).not.toHaveBeenCalled();
    sun.shadow.needsUpdate = true;
    pass.update(light, scene, null);
    expect(mirror.drawShadowPass).toHaveBeenCalledTimes(1);
    expect(mirror.drawShadowPass.mock.calls[0]![4]).toBe(target);
    expect(sun.shadow.needsUpdate).toBe(false);
    expect(pass.stats.drawn).toBe(1);
  });

  it('hands the frame back to the three on refusal', () => {
    const { host, scene, sun, light } = setup();
    const pass = new NativeSunShadowPass(host, false, false);
    mirror.drawShadowPass.mockReturnValue({ drawn: 0, refused: true, reason: 'recorte-alfa', totalCasters: 3 });
    sun.shadow.needsUpdate = true;
    pass.update(light, scene, null);
    expect(sun.shadow.needsUpdate).toBe(true);
    expect(pass.stats.handedBack).toBe(1);
  });

  it('refuses while the three map has no GPU texture yet', () => {
    const { host } = fakeHost();
    const { scene, sun } = sunScene();
    (sun.shadow as unknown as { map: unknown }).map = { depthTexture: {} };
    sun.shadow.needsUpdate = true;
    new NativeSunShadowPass(host, false, false).update(sun as unknown as SunLight, scene, null);
    expect(mirror.drawShadowPass).not.toHaveBeenCalled();
    expect(sun.shadow.needsUpdate).toBe(true);
  });

  it('takes an autoUpdate shadow over and redraws it every frame', () => {
    const { host, scene, sun, light } = setup();
    sun.shadow.autoUpdate = true;
    const pass = new NativeSunShadowPass(host, false, false);
    pass.update(light, scene, null);
    pass.update(light, scene, null);
    expect(sun.shadow.autoUpdate).toBe(false);
    expect(mirror.drawShadowPass).toHaveBeenCalledTimes(2);
  });

  it('parity mode: redraws every native frame and re-arms needsUpdate after each render for the three arm', () => {
    const { host, scene, sun, light } = setup();
    const pass = new NativeSunShadowPass(host, false, true);
    pass.update(light, scene, null);
    pass.update(light, scene, null);
    expect(mirror.drawShadowPass).toHaveBeenCalledTimes(2);
    expect(sun.shadow.needsUpdate).toBe(false);
    scene.onAfterRender(null as never, scene, null as never, null as never, null as never, null as never);
    expect(sun.shadow.needsUpdate).toBe(true);
  });

  it('parity mode forces nothing while the sun is off (the game does not redraw at night)', () => {
    const { host, scene, sun, light } = setup();
    sun.intensity = 0;
    new NativeSunShadowPass(host, false, true).update(light, scene, null);
    expect(mirror.drawShadowPass).not.toHaveBeenCalled();
  });

  it('known-answer shift moves the drawn map by PASS_SHIFT_TEXELS', () => {
    const { host, scene, sun, light } = setup();
    sun.shadow.needsUpdate = true;
    new NativeSunShadowPass(host, false, false).update(light, scene, null);
    sun.shadow.needsUpdate = true;
    new NativeSunShadowPass(host, true, false).update(light, scene, null);
    const plain = mirror.drawShadowPass.mock.calls[0]![3] as Float64Array;
    const shifted = mirror.drawShadowPass.mock.calls[1]![3] as Float64Array;
    expect(shifted[12]! - plain[12]!).toBeCloseTo((2 * PASS_SHIFT_TEXELS) / MAP_SIZE);
    expect(shifted[16 + 12]! - plain[16 + 12]!).toBeCloseTo((2 * PASS_SHIFT_TEXELS) / MAP_SIZE);
  });

  it('sends viewProj, projection and view apart (the host draws in the three float order)', () => {
    const { host, scene, sun, light } = setup();
    sun.shadow.needsUpdate = true;
    new NativeSunShadowPass(host, false, false).update(light, scene, null);
    const m = mirror.drawShadowPass.mock.calls[0]![3] as Float64Array;
    expect(m.length).toBe(48);
    expect(Array.from(m.subarray(16, 32))).toEqual(sun.shadow.camera.projectionMatrix.elements);
    expect(Array.from(m.subarray(32, 48))).toEqual(sun.shadow.camera.matrixWorldInverse.elements);
  });

  it('shiftClipX pre-multiplies a clip-space x translation', () => {
    const m = new Float64Array([1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    shiftClipX(m, 0.5);
    expect(Array.from(m)).toEqual([2, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0, 0, 1]);
  });
});
