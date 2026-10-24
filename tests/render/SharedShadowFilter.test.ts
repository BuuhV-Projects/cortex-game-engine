import { describe, it, expect } from 'vitest';
import { BasicShadowMap, PCFShadowMap, PCFSoftShadowMap } from 'three';
import { ShadowNode } from 'three/webgpu';
import { installSharedShadowFilter, sharedPCFShadowFilter, sharedShadowFilterRequested } from '../../src/render/SharedShadowFilter.js';

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
});
