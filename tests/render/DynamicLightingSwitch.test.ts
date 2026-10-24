import { describe, it, expect } from 'vitest';
import { SpotLight } from 'three';
import { DynamicLighting } from 'three/examples/jsm/lighting/DynamicLighting.js';
import { dynamicLightingRequested, installDynamicLighting } from '../../src/render/DynamicLightingSwitch.js';

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
});
