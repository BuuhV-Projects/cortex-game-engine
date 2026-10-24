import { describe, it, expect } from 'vitest';
import { BoxGeometry, DoubleSide, HalfFloatType, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, RGFormat, Scene, Texture } from 'three';
import { classifyDrawable, type Classification } from '../../../src/render/native/RendererClassifier.js';
import { dfgTexture, standardModel } from '../../../src/render/native/models/standard.js';
import { LightsBlock } from '../../../src/render/native/frame/lights.js';
import { NativeRenderer } from '../../../src/render/native/NativeRenderer.js';
import { NATIVE_MODELS } from '../../../src/render/native/models/index.js';
import type { DrawBatchBridge } from '../../../src/render/DrawBatch.js';

type Covered = Classification & { kind: 'covered' };
/** What the core removes before the model sees the classification (object/pipeline features). */
const CORE = new Set(['doubleSide']);
const DFG_TEXELS = 16 * 16;
const RG = 2;

function variant(mesh: Mesh): string[] | null {
  const c = classifyDrawable(mesh, mesh.material as MeshStandardMaterial) as Covered;
  return standardModel.variant({ ...c, features: c.features.filter((f) => !CORE.has(f)) }, mesh, mesh.material as MeshStandardMaterial);
}

describe('standard model (R1.2, SPEC-0535)', () => {
  it('takes map/emissiveMap/doubleSide and refuses vertexColors, metal/rough maps and Physical extras', () => {
    const lightsBlock = new LightsBlock({ createBuffer: () => ({}), queue: { writeBuffer: () => undefined } });
    const cam = new PerspectiveCamera();
    cam.updateMatrixWorld();
    lightsBlock.update(new Scene(), cam);
    const map = new Texture();
    expect(variant(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map, emissiveMap: map, side: DoubleSide })))).toEqual(['map', 'emissiveMap', 'fog', 'doubleSide']);
    expect(variant(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ vertexColors: true })))).toBeNull();
    expect(variant(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ roughnessMap: map })))).toBeNull();
    expect(variant(new Mesh(new BoxGeometry(), new MeshPhysicalMaterial({ ior: 1.4 })))).toBeNull();
  });

  it('writes metalness and roughness after the lit rows, and binds the DFG LUT last', () => {
    const m = new MeshStandardMaterial({ metalness: 0.9, roughness: 0.3, map: new Texture() });
    const out = new Float32Array(standardModel.paramFloats);
    standardModel.writeParams(m, out);
    expect([out[32], out[33]]).toEqual([0.9, 0.3].map(Math.fround));
    const textures = standardModel.textures(m, ['map']);
    expect(textures).toEqual([m.map, dfgTexture()]);
    const lut = dfgTexture();
    expect([lut.image.width, lut.format, lut.type, lut.generateMipmaps]).toEqual([16, RGFormat, HalfFloatType, false]);
    expect((lut.image.data as Uint16Array).length).toBe(DFG_TEXELS * RG);
  });

  it('emits the GGX multiscatter for the sun and each spot, with the DFG binding after the maps', () => {
    const code = standardModel.wgsl(['map', 'emissiveMap', 'fog']);
    expect(code).toContain('@group(2) @binding(5) var dfgSampler');
    expect(code).toContain('@group(2) @binding(6) var dfgTexture');
    expect(code.match(/BRDF_GGX_Multiscatter\(/g)).toHaveLength(3);
    expect(code).toContain('dpdx(normalGeometry)');
  });

  it('is taken by the core with lambert, and the module carries the lights block', () => {
    const modules: string[] = [];
    let id = 0;
    const device = {
      createBuffer: () => ({ id: id++ }),
      createBindGroupLayout: () => ({}),
      createBindGroup: () => ({ id: id++ }),
      createPipelineLayout: () => ({}),
      createShaderModule: (d: { code: string }) => (modules.push(d.code), { id: id++ }),
      createRenderPipeline: () => ({ id: id++ }),
      queue: { writeBuffer: () => undefined },
    };
    const data = new WeakMap<object, Record<string, unknown>>();
    const get = (o: object) => data.get(o) ?? (data.set(o, {}), data.get(o)!);
    const host = {
      backend: { device, get, utils: { getCurrentColorFormat: () => 'rgba16float', getCurrentDepthStencilFormat: () => 'depth24plus', getSampleCountRenderContext: () => 1 } },
      _textures: {
        updateTexture: (t: object) => void (get(t)['texture'] ??= { createView: () => ({}) }),
        updateSampler: (t: object) => void (get(t)['sampler'] ??= {}),
      },
      toneMapping: 0,
    };
    const bridge: DrawBatchBridge = { record: () => 0, release: () => undefined, flush: () => 0 };
    const nr = new NativeRenderer(host as never, bridge, NATIVE_MODELS, null);
    const cam = new PerspectiveCamera();
    cam.updateMatrixWorld();
    nr.beginFrame(cam, new Scene());
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const entry = nr.take(mesh, mesh.material, mesh.geometry)!;
    expect(entry).not.toBeNull();
    expect(nr.recipeFor(entry, {})).toBe(0);
    expect(modules.at(-1)).toContain('var<uniform> lights : NativeLights');
    expect(modules.at(-1)).toContain('fn nativeShadow');
  });
});
