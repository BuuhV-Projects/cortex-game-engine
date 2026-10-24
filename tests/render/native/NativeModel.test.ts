import { describe, it, expect } from 'vitest';
import { VIEW_FLOATS, VIEW_TIME_AT, coreWgsl } from '../../../src/render/native/models/NativeModel.js';

describe('coreWgsl (SPEC-0555, SPEC-0565)', () => {
  it('plain: the vertex as is, time in the view block inside its 40 floats', () => {
    const code = coreWgsl(['position', 'normal']);
    expect(code).toContain('return vec4<f32>(vin.position, 1.0);');
    expect(code).toContain('return vin.normal;');
    expect(code).toContain('time : f32');
    expect(VIEW_TIME_AT).toBeLessThan(VIEW_FLOATS);
  });

  it('instanced: matrix columns after the model attributes, applied in the local space with the scaled normal', () => {
    const code = coreWgsl(['position', 'normal', 'uv'], '', { instanced: true });
    expect(code).toContain('@location(3) instanceMatrix0 : vec4<f32>');
    expect(code).toContain('@location(6) instanceMatrix3 : vec4<f32>');
    expect(code).toContain('(nativeInstanceMatrix(vin) * vec4<f32>(vin.position, 1.0)).xyz');
    expect(code).toContain('vin.normal / vec3<f32>(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]))');
  });

  it('skinned: skin attributes after the model ones, bones in group 3, the three SkinningNode order', () => {
    const code = coreWgsl(['position', 'normal'], '', { skinned: true });
    expect(code).toContain('@location(2) skinIndex : vec4<u32>');
    expect(code).toContain('@location(3) skinWeight : vec4<f32>');
    expect(code).toContain('@group(3) @binding(1) var<storage, read> skin : Skin;');
    expect(code).toContain('(skin.bones[i.x] * w.x) * v + (skin.bones[i.y] * w.y) * v');
    expect(code).toContain('normalize((skinMatrix * vec4<f32>(vin.normal, 0.0)).xyz)');
  });

  it('a game model declares the WGSL type of its own attributes', () => {
    const code = coreWgsl(['position', 'instancePaint', 'paintMask'], '', { attributeTypes: { instancePaint: 'vec3<f32>', paintMask: 'f32' } });
    expect(code).toContain('@location(1) instancePaint : vec3<f32>');
    expect(code).toContain('@location(2) paintMask : f32');
  });
});
