/**
 * `terrainSplat` (SPEC-0662): o terreno pintado sai do three em JS e vai para o renderer nativo.
 *
 * O que estes testes travam: o material do `buildTerrainSplatMaterial` é classificado para o modelo do jogo
 * (não `refused:node:colorNode`), a variante pede uv, as texturas vão na ordem splat, 4 camadas, DFG (lidas
 * dos nós, então a troca ao vivo chega), o tiling vai para `layerRepeat` e o WGSL tem o blend na ordem do three.
 */
import { describe, it, expect } from 'vitest';
import { DataTexture, Mesh, PlaneGeometry, Texture } from 'three';
import { classifyDrawable, type Classification } from '../../../src/render/native/RendererClassifier.js';
import { terrainSplatModel } from '../../../src/render/native/models/terrainSplat.js';
import { STANDARD_PARAM_FLOATS, dfgTexture } from '../../../src/render/native/models/standard.js';
import { gameMaterialModel } from '../../../src/render/native/GameMaterials.js';
import { buildTerrainSplatMaterial } from '../../../src/scene/terrainSplatMaterial.js';

type Covered = Classification & { kind: 'covered' };

describe('terrainSplat (SPEC-0662)', () => {
  it('classifica o material de splat para o modelo nativo e pede uv', () => {
    const splat = new DataTexture(new Uint8Array(4), 1, 1);
    const { material } = buildTerrainSplatMaterial(splat);
    const mesh = new Mesh(new PlaneGeometry(), material);
    mesh.receiveShadow = true;
    const c = classifyDrawable(mesh, material) as Covered;
    expect(c.kind).toBe('covered');
    expect(c.model).toBe('wgsl:cortexTerrainSplat');
    expect(gameMaterialModel(c.model)).toBeDefined();
    const variant = terrainSplatModel.variant({ ...c, features: c.features.filter((f) => f !== 'receiveShadow') }, mesh, material);
    expect(variant).toEqual(['fog', 'splat']);
    expect(terrainSplatModel.attributes(variant!)).toContain('uv');
    expect(terrainSplatModel.variant(c, mesh, new Mesh().material as never)).toBeNull();
  });

  it('lê splat, camadas e tiling dos nós (troca ao vivo) e põe o DFG por último', () => {
    const splat = new DataTexture(new Uint8Array(4), 1, 1);
    const built = buildTerrainSplatMaterial(splat);
    const grass = new Texture();
    built.layers[1]!.value = grass;
    built.repeats[1]!.value = 8;
    const textures = terrainSplatModel.textures(built.material, ['fog', 'splat']);
    expect(textures[0]).toBe(splat);
    expect(textures[2]).toBe(grass);
    expect(textures).toHaveLength(6);
    expect(textures[5]).toBe(dfgTexture());
    const out = new Float32Array(terrainSplatModel.paramFloats);
    terrainSplatModel.writeParams(built.material, out);
    expect([...out.slice(STANDARD_PARAM_FLOATS, STANDARD_PARAM_FLOATS + 4)]).toEqual([1, 8, 1, 1]);
  });

  it('gera o blend do three e a iluminação do standard com os bindings antes do DFG', () => {
    const code = terrainSplatModel.wgsl(['fog', 'receiveShadow', 'splat']);
    expect(code).toContain('layerRepeat : vec4<f32>');
    expect(code).toContain('var splatSampler');
    expect(code).toContain('var layer3Texture');
    expect(code.indexOf('var layer3Texture')).toBeLessThan(code.indexOf('var dfgTexture'));
    expect(code).toContain('mix(params.color, blended, clamp(weight, 0.0, 1.0))');
    expect(code).toContain('max(weight, 0.0001)');
    expect(code.match(/BRDF_GGX_Multiscatter\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(code).not.toContain('textureSample(mapTexture');
  });
});
