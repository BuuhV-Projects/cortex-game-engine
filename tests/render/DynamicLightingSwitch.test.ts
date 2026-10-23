import { describe, it, expect } from 'vitest';
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
});
