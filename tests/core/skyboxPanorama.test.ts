/** SPEC-0296: panorama equiretangular como fundo; luz só com `lighting`. */
import { describe, expect, it } from 'vitest';
import { EquirectangularReflectionMapping, SRGBColorSpace, Texture } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { Skybox } from '../../src/core/Skybox.js';

describe('Skybox.fromPanorama', () => {
  it('vira fundo em sRGB equiretangular sem mexer na luz da cena', () => {
    const scene = new Scene();
    const gradient = Skybox.fromGradient(scene, { resolution: 8 });
    const panorama = Skybox.fromPanorama(scene, new Texture());
    const three = scene.getThreeScene();
    expect(three.background).toBe(panorama);
    expect(three.environment).toBe(gradient);
    expect(panorama.mapping).toBe(EquirectangularReflectionMapping);
    expect(panorama.colorSpace).toBe(SRGBColorSpace);
  });

  it('com lighting também ilumina a cena', () => {
    const scene = new Scene();
    const panorama = Skybox.fromPanorama(scene, new Texture(), { lighting: true, environmentIntensity: 0.7 });
    const three = scene.getThreeScene();
    expect(three.environment).toBe(panorama);
    expect(three.environmentIntensity).toBe(0.7);
  });
});

describe('template de projeto novo (ADR-0295)', () => {
  it('declara um skybox que existe no próprio template', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { parseSceneDefinition } = await import('../../src/scene/SceneDefinition.js');
    const root = new URL('../../templates/new-project/', import.meta.url);
    const level = parseSceneDefinition(JSON.parse(readFileSync(new URL('scenes/level.json', root), 'utf8')));
    const skybox = level?.outdoorLighting?.skybox;
    expect(skybox).toBeTruthy();
    expect(existsSync(new URL(skybox!, root))).toBe(true);
  });
});
