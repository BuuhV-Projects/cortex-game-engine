import { describe, it, expect } from 'vitest';
import { BoxGeometry, Color, DoubleSide, Float32BufferAttribute, HalfFloatType, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, ObjectSpaceNormalMap, PerspectiveCamera, RGFormat, Scene, Texture, Vector2 } from 'three';
import { classifyDrawable, type Classification } from '../../../src/render/native/RendererClassifier.js';
import { dfgTexture, standardModel, standardRefusal } from '../../../src/render/native/models/standard.js';
import { LightsBlock } from '../../../src/render/native/frame/lights.js';
import { NativeRenderer } from '../../../src/render/native/NativeRenderer.js';
import { LIT_PARAM_FLOATS, lambertModel } from '../../../src/render/native/models/lambert.js';
import type { DrawBatchBridge } from '../../../src/render/DrawBatch.js';

type Covered = Classification & { kind: 'covered' };
/** What the core removes before the model sees the classification (object/pipeline features). */
const CORE = new Set(['doubleSide']);
const DFG_TEXELS = 16 * 16;
const RG = 2;
/** Offsets of the standard params after the lit rows (metalness/roughness, F0, normal scale, uv transforms). */
const F0_AT = LIT_PARAM_FLOATS + 4;
const NORMAL_SCALE_AT = LIT_PARAM_FLOATS + 8;
const NORMAL_TRANSFORM_AT = LIT_PARAM_FLOATS + 24;

function variant(mesh: Mesh): string[] | null {
  const c = classifyDrawable(mesh, mesh.material as MeshStandardMaterial) as Covered;
  return standardModel.variant({ ...c, features: c.features.filter((f) => !CORE.has(f)) }, mesh, mesh.material as MeshStandardMaterial);
}

describe('standard model (R1.2, SPEC-0535)', () => {
  it('takes map/emissiveMap/doubleSide/vertexColors, the glTF metal/rough + normal maps and Physical ior/specular (SPEC-0659)', () => {
    const lightsBlock = new LightsBlock({ createBuffer: () => ({}), queue: { writeBuffer: () => undefined } });
    const cam = new PerspectiveCamera();
    cam.updateMatrixWorld();
    lightsBlock.update(new Scene(), cam);
    const map = new Texture();
    expect(variant(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map, emissiveMap: map, side: DoubleSide })))).toEqual(['map', 'emissiveMap', 'fog']);
    expect(variant(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ vertexColors: true })))).toEqual(['vertexColors', 'fog']);
    const gltf = new MeshPhysicalMaterial({ map, metalnessMap: map, roughnessMap: map, normalMap: map, ior: 1.4 });
    expect(variant(new Mesh(new BoxGeometry(), gltf))).toEqual(['map', 'metalRoughMap', 'normalMap', 'fog']);
    expect(variant(new Mesh(new BoxGeometry(), new MeshPhysicalMaterial({ ior: 1.4 })))).toEqual(['fog']);
  });

  it('refuses what it does not reproduce: split metal/rough maps, object-space or vertex-tangent normal maps, flat shading, specular maps', () => {
    const map = new Texture();
    const mesh = (m: MeshStandardMaterial) => new Mesh(new BoxGeometry(), m);
    expect(standardRefusal(mesh(new MeshStandardMaterial({ roughnessMap: map })), new MeshStandardMaterial({ roughnessMap: map }))).toBe('metalRoughSplit');
    const object = new MeshStandardMaterial({ normalMap: map, normalMapType: ObjectSpaceNormalMap });
    expect(variant(mesh(object))).toBeNull();
    const tangent = mesh(new MeshStandardMaterial({ normalMap: map }));
    tangent.geometry.setAttribute('tangent', new Float32BufferAttribute(new Float32Array(4 * 24), 4));
    expect(variant(tangent)).toBeNull();
    expect(variant(mesh(new MeshStandardMaterial({ flatShading: true })))).toBeNull();
    expect(variant(new Mesh(new BoxGeometry(), new MeshPhysicalMaterial({ specularColorMap: map })))).toBeNull();
    const uv1 = new Texture();
    uv1.channel = 1;
    expect(standardRefusal(mesh(new MeshStandardMaterial({ normalMap: uv1 })), new MeshStandardMaterial({ normalMap: uv1 }))).toBe('uvChannel');
    expect(standardRefusal(mesh(new MeshStandardMaterial()), new MeshStandardMaterial({ metalnessMap: uv1, roughnessMap: uv1 }))).toBe('uvChannel');
  });

  it('writes the F0 the three uses: 0.04 for Standard, min(((ior-1)/(ior+1))^2 * specularColor, 1) * specularIntensity for Physical', () => {
    const out = new Float32Array(standardModel.paramFloats);
    standardModel.writeParams(new MeshStandardMaterial(), out);
    expect([...out.slice(F0_AT, F0_AT + 3)]).toEqual([0.04, 0.04, 0.04].map(Math.fround));
    const physical = new MeshPhysicalMaterial({ ior: 1.4, specularIntensity: 0.6, specularColor: new Color(1, 0.5, 0.25) });
    standardModel.writeParams(physical, out);
    const f0 = ((1.4 - 1) / (1.4 + 1)) ** 2;
    expect([...out.slice(F0_AT, F0_AT + 3)]).toEqual([f0 * 0.6, f0 * 0.5 * 0.6, f0 * 0.25 * 0.6].map(Math.fround));
  });

  it('writes metalness and roughness after the lit rows, and binds the DFG LUT last', () => {
    const m = new MeshStandardMaterial({ metalness: 0.9, roughness: 0.3, map: new Texture() });
    const out = new Float32Array(standardModel.paramFloats);
    standardModel.writeParams(m, out);
    expect([out[LIT_PARAM_FLOATS], out[LIT_PARAM_FLOATS + 1]]).toEqual([0.9, 0.3].map(Math.fround));
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

  it('binds metal/rough and normal before the DFG LUT, writes their uv transforms and the normal scale', () => {
    const map = new Texture();
    const normal = new Texture();
    normal.repeat.set(2, 3);
    const m = new MeshStandardMaterial({ map, metalnessMap: map, roughnessMap: map, normalMap: normal, normalScale: new Vector2(1, -1) });
    const v = ['map', 'metalRoughMap', 'normalMap', 'fog'];
    expect(standardModel.textures(m, v)).toEqual([map, map, normal, dfgTexture()]);
    expect(standardModel.attributes(v)).toContain('uv');
    const out = new Float32Array(standardModel.paramFloats);
    standardModel.writeParams(m, out);
    expect([out[NORMAL_SCALE_AT], out[NORMAL_SCALE_AT + 1]]).toEqual([1, -1]);
    expect([out[NORMAL_TRANSFORM_AT], out[NORMAL_TRANSFORM_AT + 5]]).toEqual([2, 3]);
    const code = standardModel.wgsl([...v, 'receiveShadow']);
    expect(code).toContain('@group(2) @binding(3) var metalRoughSampler');
    expect(code).toContain('@group(2) @binding(5) var normalSampler');
    expect(code).toContain('@group(2) @binding(8) var dfgTexture');
    expect(code).toContain('metalness * metalRough.z');
    expect(code).toContain('cross(-dpdy(in.positionView), normal)');
    // the perturbed normal comes before the shadow, which biases along it
    expect(code.indexOf('normal = normalize(tbn')).toBeLessThan(code.indexOf('nativeShadow(in.positionWorld'));
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
      createSampler: () => ({ id: id++ }),
      createTexture: () => ({ id: id++, createView: () => ({}) }),
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
    const nr = new NativeRenderer(host as never, bridge, [lambertModel, standardModel], null);
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
