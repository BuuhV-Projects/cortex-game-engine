import { describe, it, expect } from 'vitest';
import { SpotLight } from 'three';
import { DynamicLighting } from 'three/examples/jsm/lighting/DynamicLighting.js';
import { applyParityLighting, dynamicLightingRequested, installDynamicLighting } from '../../src/render/DynamicLightingSwitch.js';
import { ParityFreeze, mainPassArm } from '../../src/render/MainPassArm.js';

describe('DynamicLightingSwitch (SPEC-0435 (d′))', () => {
  it('is off unless asked, and swaps the renderer lighting for a sized DynamicLighting', () => {
    expect(dynamicLightingRequested(false)).toBe(false);
    const renderer: { lighting: unknown } = { lighting: null };
    installDynamicLighting(renderer);
    expect(renderer.lighting).toBeInstanceOf(DynamicLighting);
    expect((renderer.lighting as DynamicLighting).options).toMatchObject({ maxSpotLights: 8, maxPointLights: 8 });
  });

  it('hasLights does not depend on `super` (the export Babel breaks super getters)', () => {
    const renderer: { lighting: unknown } = { lighting: null };
    installDynamicLighting(renderer);
    const lighting = renderer.lighting as DynamicLighting & { createNode(l: unknown[]): { hasLights: boolean } };
    expect(lighting.createNode([]).hasLights).toBe(false);
    expect(lighting.createNode([new SpotLight()]).hasLights).toBe(true);
    // The getter must work with the instance as `this` and never read the prototype chain's own state.
    const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(lighting.createNode([])), 'hasLights')!.get!;
    expect(getter.toString()).not.toContain('super');
  });

  it('same-run parity: frozen frames alternate the lighting, not the draw path (SPEC-0435)', () => {
    class FakeLists {
      constructor(readonly lighting: unknown) {}
    }
    const renderer: { lighting: unknown; _renderLists?: FakeLists } = { lighting: 'base' };
    installDynamicLighting(renderer);
    const dynamic = renderer.lighting;
    // The three builds its RenderLists at init, with the lighting installed before it.
    renderer._renderLists = new FakeLists(dynamic);
    const freeze = new ParityFreeze(1, true);
    mainPassArm.three = false;
    mainPassArm.lighting = false;
    expect(freeze.shouldUpdate(0, true)).toBe(true);
    expect(freeze.shouldUpdate(2000, true)).toBe(false); // freezes
    applyParityLighting(renderer);
    expect(renderer.lighting).toBe(dynamic);
    freeze.shouldUpdate(2016, true);
    applyParityLighting(renderer);
    expect(renderer.lighting).toBe('base');
    expect(renderer._renderLists!.lighting).toBe('base'); // the lists follow (the three reads them, not .lighting)
    expect(mainPassArm.three).toBe(false);
    freeze.shouldUpdate(2032, true);
    applyParityLighting(renderer);
    expect(renderer.lighting).toBe(dynamic);
    mainPassArm.lighting = false;
  });
});
