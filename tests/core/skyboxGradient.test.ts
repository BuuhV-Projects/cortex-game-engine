/**
 * Skybox.fromGradient — céu gradiente procedural (sem arquivo), WebGPU-safe via
 * DataTexture equiretangular 2:1. Aplica como background + environment.
 */
import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { Skybox } from '../../src/core/Skybox.js';

describe('Skybox.fromGradient', () => {
  it('aplica gradiente azul como background + environment (DataTexture 2:1)', () => {
    const scene = new Scene();
    const tex = Skybox.fromGradient(scene, { top: '#1565d8', middle: '#bfe0fb', resolution: 64 });
    const three = scene.getThreeScene();

    expect(three.background).toBe(tex);
    expect(three.environment).toBe(tex);
    expect(tex.image.width).toBe(128);
    expect(tex.image.height).toBe(64);

    const data = tex.image.data as Uint8Array;
    // Sample using the renderer's equirectUV convention, not image-file rows.
    const zenithV = Math.asin(1) / Math.PI + 0.5;
    const row = Math.round(zenithV * (tex.image.height - 1));
    const stride = tex.image.width * 4;
    const zenithR = data[row * stride];
    const zenithB = data[row * stride + 2];
    const midR = data[32 * stride]; // horizonte (meio)
    expect(zenithB).toBeGreaterThan(120); // zênite é azul
    expect(zenithR).toBeLessThan(midR); // zênite menos vermelho que o horizonte pálido
    expect(Array.from(data.slice(row * stride, row * stride + 3))).toEqual([21, 101, 216]);
    expect(tex.flipY).toBe(false);
    expect(data[0]).toBeGreaterThan(data[2]); // nadir default é chão quente, não céu azul
    tex.dispose();
  });
  it('provides valid PMREM dimensions and no longitude seam, even at tiny requested resolutions', () => {
    const texture = Skybox.fromGradient(new Scene(), { resolution: 8 });
    const { width, height, data } = texture.image;
    expect(width / height).toBe(2);
    expect(width / 4).toBeGreaterThanOrEqual(16);
    for (let y = 0; y < height; y++) {
      const first = y * width * 4;
      const last = (y * width + width - 1) * 4;
      expect(Array.from(data.slice(first, first + 4))).toEqual(Array.from(data.slice(last, last + 4)));
    }
    texture.dispose();
  });
});
