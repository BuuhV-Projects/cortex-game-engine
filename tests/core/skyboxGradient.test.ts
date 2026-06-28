/**
 * Skybox.fromGradient — céu gradiente procedural (sem arquivo), WebGPU-safe via
 * DataTexture equiretangular 1×N. Aplica como background + environment.
 */
import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { Skybox } from '../../src/core/Skybox.js';

describe('Skybox.fromGradient', () => {
  it('aplica gradiente azul como background + environment (DataTexture 1×N)', () => {
    const scene = new Scene();
    const tex = Skybox.fromGradient(scene, { top: '#1565d8', middle: '#bfe0fb', resolution: 64 });
    const three = scene.getThreeScene();

    expect(three.background).toBe(tex);
    expect(three.environment).toBe(tex);
    expect(tex.image.width).toBe(1);
    expect(tex.image.height).toBe(64);

    const data = tex.image.data as Uint8Array;
    const zenithR = data[(64 - 1) * 4]; // topo (+Y)
    const zenithB = data[(64 - 1) * 4 + 2];
    const midR = data[32 * 4]; // horizonte
    expect(zenithB).toBeGreaterThan(120); // zênite é azul
    expect(zenithR).toBeLessThan(midR); // zênite menos vermelho que o horizonte pálido
  });
});
