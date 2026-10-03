/**
 * SPEC-0288: `instance()` corrige a esfera de culling uma vez por geometria —
 * a primeira instância conserta a esfera do loader, as seguintes reaproveitam.
 */
import { describe, it, expect, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three';
import { instance } from '../../src/scene/SceneAssets.js';
import type { GLTF } from '../../src/core/AssetLoader.js';

const BOX_SIZE = 2;

function gltfWithBox(): { gltf: GLTF; geometry: BoxGeometry } {
  const geometry = new BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
  // Esfera "do loader" que não cobre a malha — o caso que o recálculo corrige.
  geometry.boundingSphere = new Sphere(new Vector3(), 0);
  const scene = new Group();
  scene.add(new Mesh(geometry, new MeshStandardMaterial()));
  return { gltf: { scene, animations: [] } as unknown as GLTF, geometry };
}

describe('instance() — esfera de culling (SPEC-0288)', () => {
  it('a primeira instância corrige a esfera do loader', () => {
    const { gltf, geometry } = gltfWithBox();
    instance(gltf);
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
  });

  it('instâncias seguintes não percorrem os vértices de novo', () => {
    const { gltf, geometry } = gltfWithBox();
    const spy = vi.spyOn(geometry, 'computeBoundingSphere');
    instance(gltf);
    instance(gltf);
    instance(gltf);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
