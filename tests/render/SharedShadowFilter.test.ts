import { describe, it, expect } from 'vitest';
import { BasicShadowMap, PCFShadowMap, PCFSoftShadowMap } from 'three';
import { ShadowNode } from 'three/webgpu';
import { DirectionalLight } from 'three';
import { installSharedShadowFilter, shadowRefs, sharedPCFShadowFilter, sharedShadowFilterRequested } from '../../src/render/SharedShadowFilter.js';

describe('SharedShadowFilter (SPEC-0445)', () => {
  it('is off unless asked; once installed, PCF uses the shared filter and the other types keep the three ones', () => {
    expect(sharedShadowFilterRequested(false)).toBe(false);
    const proto = ShadowNode.prototype as unknown as { getShadowFilterFn(type: number): unknown };
    const basic = proto.getShadowFilterFn(BasicShadowMap);
    const soft = proto.getShadowFilterFn(PCFSoftShadowMap);
    expect(proto.getShadowFilterFn(PCFShadowMap)).not.toBe(sharedPCFShadowFilter);
    installSharedShadowFilter();
    installSharedShadowFilter(); // idempotent
    expect(proto.getShadowFilterFn(PCFShadowMap)).toBe(sharedPCFShadowFilter);
    expect(proto.getShadowFilterFn(BasicShadowMap)).toBe(basic);
    expect(proto.getShadowFilterFn(PCFSoftShadowMap)).toBe(soft);
  });

  it('the references are created once per shadow even when the Fn hands a different wrapper each build', () => {
    const shadow = new DirectionalLight().shadow;
    const wrapperA = Object.create(shadow) as typeof shadow;
    const wrapperB = { ...shadow, mapSize: shadow.mapSize } as unknown as typeof shadow;
    const a = shadowRefs(wrapperA);
    expect(shadowRefs(wrapperB)).toBe(a);
    expect(shadowRefs(shadow)).toBe(a);
    expect(shadowRefs(new DirectionalLight().shadow)).not.toBe(a);
  });
});
