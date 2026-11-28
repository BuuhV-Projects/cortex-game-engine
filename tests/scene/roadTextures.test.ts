/**
 * SPEC-0757 / ADR-0758 — a textura de estrada é uma por URL, dividida por todas as estradas e sem clone (a BC7
 * cozida subiria vazia no clone), com o wrap, o sRGB e a anisotropia da pista.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { ROAD_ANISOTROPY, clearRoadTextures, roadTexture } from '../../src/scene/roadTextures.js';

afterEach(() => {
  clearRoadTextures();
  vi.restoreAllMocks();
});

describe('textura de estrada (SPEC-0757)', () => {
  it('duas estradas com a mesma URL dividem a textura, sem clone', async () => {
    const load = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
    const clone = vi.spyOn(Texture.prototype, 'clone');
    const [a, b] = await Promise.all([roadTexture('assets/asfalto.jpg'), roadTexture('assets/asfalto.jpg')]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(clone).not.toHaveBeenCalled();
    expect(a.wrapS).toBe(RepeatWrapping);
    expect(a.wrapT).toBe(RepeatWrapping);
    expect(a.colorSpace).toBe(SRGBColorSpace);
    expect(a.anisotropy).toBe(ROAD_ANISOTROPY);
  });
});
