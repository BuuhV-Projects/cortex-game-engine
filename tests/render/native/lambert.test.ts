import { describe, it, expect } from 'vitest';
import { InstancedMesh, BoxGeometry, Color, DoubleSide, BackSide, Mesh, MeshLambertMaterial, PerspectiveCamera, PointLight, Scene, Texture } from 'three';
import { classifyDrawable, type Classification } from '../../../src/render/native/RendererClassifier.js';
import { lambertModel } from '../../../src/render/native/models/lambert.js';
import { LightsBlock } from '../../../src/render/native/frame/lights.js';

type Covered = Classification & { kind: 'covered' };
/** What the core removes before the model sees the classification (object/pipeline features). */
const CORE = new Set(['doubleSide']);

function classify(mesh: Mesh): Covered {
  const c = classifyDrawable(mesh, mesh.material as MeshLambertMaterial);
  if (c.kind !== 'covered') throw new Error('not covered');
  return { ...c, features: c.features.filter((f) => !CORE.has(f)) };
}

function variant(mesh: Mesh): string[] | null {
  return lambertModel.variant(classify(mesh), mesh, mesh.material as MeshLambertMaterial);
}

function lights(scene: Scene): void {
  const block = new LightsBlock({ createBuffer: () => ({}), queue: { writeBuffer: () => undefined } });
  const cam = new PerspectiveCamera();
  cam.updateMatrixWorld();
  block.update(scene, cam);
}

describe('lambert model (R1.2, SPEC-0535)', () => {
  it('builds the DDD 61 variants and the attributes they read', () => {
    lights(new Scene());
    const map = new Texture();
    const mesh = new Mesh(new BoxGeometry(), new MeshLambertMaterial({ map, vertexColors: true }));
    expect(variant(mesh)).toEqual(['map', 'vertexColors', 'fog']);
    expect(lambertModel.attributes(variant(mesh)!)).toEqual(['position', 'normal', 'uv', 'color']);
    expect(lambertModel.textures(mesh.material as MeshLambertMaterial, variant(mesh)!)).toEqual([map]);
    // animated emissive back on (the stale three arm was the RenderIdRefresh, SPEC-0555)
    expect(variant(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ map, emissive: new Color(1, 1, 1), emissiveMap: map })))).toEqual(['map', 'emissiveMap', 'fog']);
    expect(variant(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ map, emissiveMap: map })))).toEqual(['map', 'emissiveMap', 'fog']);
    const plain = new Mesh(new BoxGeometry(), new MeshLambertMaterial({ fog: false, side: DoubleSide, alphaTest: 0.5 }));
    expect(variant(plain)).toEqual(['alphaTest', 'doubleSide']);
    expect(lambertModel.attributes(variant(plain)!)).toEqual(['position', 'normal']);
  });

  it('takes receiveShadow (the shadow block is ready), refuses BackSide, normalMap and unsupported lights', () => {
    lights(new Scene());
    const shadowed = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
    shadowed.receiveShadow = true;
    expect(variant(shadowed)).toEqual(['fog', 'receiveShadow']);
    expect(lambertModel.wgsl(variant(shadowed)!)).toContain('nativeShadow(in.positionWorld');
    expect(variant(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ side: BackSide })))).toBeNull();
    expect(variant(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ normalMap: new Texture() })))).toBeNull();
    expect(variant(new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), 2) as unknown as Mesh)).toBeNull();
    lights(new Scene().add(new PointLight()) as Scene);
    expect(variant(new Mesh(new BoxGeometry(), new MeshLambertMaterial()))).toBeNull();
    lights(new Scene());
  });

  it('writes color, opacity, emissive x intensity, alphaTest and one uv transform per map', () => {
    const map = new Texture();
    map.offset.set(0.25, 0.5);
    const emissiveMap = new Texture();
    emissiveMap.repeat.set(2, 3);
    const m = new MeshLambertMaterial({ color: new Color(0.1, 0.2, 0.3), opacity: 0.5, emissive: new Color(1, 0.5, 0), emissiveIntensity: 2, alphaTest: 0.25, map, emissiveMap });
    const out = new Float32Array(lambertModel.paramFloats);
    lambertModel.writeParams(m, out);
    expect([...out.slice(0, 8)]).toEqual([0.1, 0.2, 0.3, 0.5, 2, 1, 0, 0.25].map(Math.fround));
    // map: translation (0.25, 0.5) in the third column; emissiveMap: scale (2, 3)
    expect([out[16], out[17]]).toEqual([0.25, 0.5]);
    expect([out[20], out[25]]).toEqual([2, 3]);
  });

  it('emits WGSL with the lights loop, the face flip and only the features of the variant', () => {
    const full = lambertModel.wgsl(['map', 'emissiveMap', 'vertexColors', 'fog', 'alphaTest', 'doubleSide']);
    expect(full).toContain('nativeSpot(i, in.positionView)');
    expect(full).toContain('nativeHemiIrradiance(normal)');
    expect(full).toContain('f32(isFront)');
    expect(full).toContain('discard');
    expect(full).toContain('emissiveTexture');
    expect(full).toContain('view.fogColor');
    const plain = lambertModel.wgsl([]);
    expect(plain).not.toContain('textureSample');
    expect(plain).not.toContain('discard');
    expect(plain).not.toContain('fogColor');
    expect(plain).not.toContain('nativeShadow');
  });
});

describe('lit refusal reasons in the census (SPEC-0535)', () => {
  it('names why a lit model refuses a covered drawable, and is null when it draws it', async () => {
    const { litCensusReason } = await import('../../../src/render/native/RendererCensus.js');
    lights(new Scene());
    const reason = (mesh: Mesh) => litCensusReason(classifyDrawable(mesh, mesh.material as MeshLambertMaterial), mesh.material as MeshLambertMaterial);
    expect(reason(new Mesh(new BoxGeometry(), new MeshLambertMaterial()))).toBeNull();
    expect(reason(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ side: BackSide })))).toBe('backSide');
    const { litRefusalCounts } = await import('../../../src/render/native/models/lambert.js');
    const back = new Mesh(new BoxGeometry(), new MeshLambertMaterial({ side: BackSide, name: 'costas' }));
    variant(back);
    expect(litRefusalCounts.get('lambert:backSide|costas')).toBe(1);
    expect(reason(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ normalMap: new Texture() })))).toBe('feature:normalMap');
    // core features (doubleSide, instanced…) are the core's, not a lit refusal
    expect(reason(new Mesh(new BoxGeometry(), new MeshLambertMaterial({ side: DoubleSide })))).toBeNull();
    lights(new Scene().add(new PointLight()) as Scene);
    expect(reason(new Mesh(new BoxGeometry(), new MeshLambertMaterial()))).toBe('lights:PointLight');
    lights(new Scene());
  });
});
