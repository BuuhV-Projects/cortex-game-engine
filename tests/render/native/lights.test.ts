import { describe, it, expect } from 'vitest';
import { AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, PointLight, Scene, SpotLight, Texture } from 'three';
import { LIGHTS_LAYOUT as L, LightsBlock, MAX_SPOT_LIGHTS, lightsRefusal } from '../../../src/render/native/frame/lights.js';

function fakeDevice() {
  const writes: Float32Array[] = [];
  return {
    writes,
    createBuffer: (d: unknown) => ({ kind: 'buffer', d }),
    queue: { writeBuffer: (_b: unknown, _o: number, d: ArrayBufferView) => writes.push(new Float32Array(d.buffer.slice(0))) },
  };
}

function camera(): PerspectiveCamera {
  const c = new PerspectiveCamera();
  c.position.set(0, 2, 10);
  c.updateMatrixWorld();
  return c;
}

function update(block: LightsBlock, scene: Scene, cam = camera()): Float32Array {
  scene.updateMatrixWorld();
  block.update(scene, cam);
  return block.data;
}

describe('LightsBlock (R1.2, SPEC-0535)', () => {
  it('writes the sun, the hemisphere and the spots like the three data nodes', () => {
    const scene = new Scene();
    const sun = new DirectionalLight(new Color(1, 0.5, 0.25), 2);
    sun.position.set(4, 8, 5);
    const hemi = new HemisphereLight(new Color(0, 0.5, 1), new Color(0.25, 0.125, 0), 0.5);
    hemi.position.set(0, 3, 4);
    const spot = new SpotLight(0xffffff, 30, 12, Math.PI / 6, 0.4, 2);
    spot.position.set(-3, 4, 2);
    scene.add(sun, sun.target, hemi, spot, spot.target);
    const cam = camera();
    const d = update(new LightsBlock(fakeDevice()), scene, cam);

    expect([...d.slice(L.sunColor, L.sunColor + 3)]).toEqual([2, 1, 0.5]);
    expect([...d.slice(L.sunPosition, L.sunPosition + 3)]).toEqual([4, 8, 5]);
    expect([...d.slice(L.sunTarget, L.sunTarget + 3)]).toEqual([0, 0, 0]);
    expect(d[L.hemiSky + 2]).toBeCloseTo(0.5);
    expect(d[L.hemiGround]).toBeCloseTo(0.125);
    expect([...d.slice(L.hemiDirection, L.hemiDirection + 3)].map((v) => +v.toFixed(5))).toEqual([0, 0.6, 0.8]);
    const counts = new Uint32Array(d.buffer);
    expect(counts[L.spotCount]).toBe(1);
    expect(counts[L.hemiCount]).toBe(1);
    // spot position in view space (camera at (0,2,10) looking down -z): (-3, 2, -8), cutoff 12
    expect([...d.slice(L.spotPositionCutoff, L.spotPositionCutoff + 4)].map((v) => +v.toFixed(4))).toEqual([-3, 2, -8, 12]);
    expect(d[L.spotDirectionDecay + 3]).toBe(2);
    expect(Math.hypot(d[L.spotDirectionDecay]!, d[L.spotDirectionDecay + 1]!, d[L.spotDirectionDecay + 2]!)).toBeCloseTo(1);
    expect(d[L.spotCone]).toBeCloseTo(Math.cos(Math.PI / 6));
    expect(d[L.spotCone + 1]).toBeCloseTo(Math.cos((Math.PI / 6) * 0.6));
    expect(lightsRefusal()).toBeNull();
  });

  it('caps spots at 8 in id order and skips invisible lights', () => {
    const scene = new Scene();
    const spots = Array.from({ length: MAX_SPOT_LIGHTS + 2 }, (_, i) => {
      const s = new SpotLight(0xffffff, i + 1);
      scene.add(s);
      return s;
    });
    spots[0]!.visible = false;
    const d = update(new LightsBlock(fakeDevice()), scene);
    expect(new Uint32Array(d.buffer)[L.spotCount]).toBe(MAX_SPOT_LIGHTS);
    // the first visible spot (intensity 2) is slot 0; the last one (intensity 10) is cut
    expect(d[L.spotColor]).toBe(2);
    expect(d[L.spotColor + (MAX_SPOT_LIGHTS - 1) * 4]).toBe(MAX_SPOT_LIGHTS + 1);
  });

  it('without a sun the direction stays finite and the color is zero', () => {
    const d = update(new LightsBlock(fakeDevice()), new Scene());
    expect([...d.slice(L.sunColor, L.sunColor + 3)]).toEqual([0, 0, 0]);
    expect(d[L.sunPosition + 1]! - d[L.sunTarget + 1]!).not.toBe(0);
  });

  it('rescans when a light is added to the root, and writes the buffer every frame', () => {
    const device = fakeDevice();
    const block = new LightsBlock(device);
    const scene = new Scene();
    update(block, scene);
    scene.add(new SpotLight());
    const d = update(block, scene);
    expect(new Uint32Array(d.buffer)[L.spotCount]).toBe(1);
    expect(device.writes).toHaveLength(2);
  });

  it('flags lights the models cannot reproduce', () => {
    const cases: Array<[() => Scene, string]> = [
      [() => new Scene().add(new PointLight()) as Scene, 'lights:PointLight'],
      [() => new Scene().add(new AmbientLight()) as Scene, 'lights:AmbientLight'],
      [() => new Scene().add(new DirectionalLight(), new DirectionalLight()) as Scene, 'lights:directional'],
      [() => {
        const s = new SpotLight();
        s.castShadow = true;
        return new Scene().add(s) as Scene;
      }, 'lights:spotShadow'],
      [() => {
        const scene = new Scene();
        scene.environment = new Texture();
        return scene;
      }, 'lights:environment'],
    ];
    for (const [make, reason] of cases) {
      update(new LightsBlock(fakeDevice()), make());
      expect(lightsRefusal()).toBe(reason);
    }
    update(new LightsBlock(fakeDevice()), new Scene());
    expect(lightsRefusal()).toBeNull();
  });
});
