import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Box3, DoubleSide, Mesh, MeshStandardMaterial, MeshToonMaterial, Texture, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { applyMaterial, clearMaterial } from '../../src/scene/Materials.js';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';
import { setShadows } from '../../src/scene/SceneAssets.js';

describe('toon finish regressions', () => {
  it('keeps emission, surface details, alpha and render state from the asset', () => {
    const source = new MeshStandardMaterial({
      name: 'headlight', emissive: '#ffcc55', emissiveIntensity: 2,
      emissiveMap: new Texture(), normalMap: new Texture(), aoMap: new Texture(),
      alphaMap: new Texture(), side: DoubleSide, depthWrite: false, fog: false,
    });
    const mesh = new Mesh(new BoxGeometry(), source);
    applyMaterial(mesh, { type: 'toon' });
    const toon = mesh.material as unknown as MeshToonMaterial;
    expect(toon.emissive.equals(source.emissive)).toBe(true);
    expect(toon.emissiveIntensity).toBe(2);
    for (const key of ['name', 'emissiveMap', 'normalMap', 'aoMap', 'alphaMap', 'side', 'depthWrite', 'fog'] as const) {
      expect(toon[key]).toBe(source[key]);
    }
  });

  it('off-center, scaled geometry retains placement bounds and an unscaled shader hull', () => {
    const mesh = new Mesh(new BoxGeometry().translate(30, 4, -12), new MeshStandardMaterial());
    mesh.scale.set(2, 3, 0.5);
    const before = new Box3().setFromObject(mesh);
    applyMaterial(mesh, { type: 'toon', outline: 0.012 });
    const shell = mesh.children[0] as Mesh;
    expect(shell.geometry).toBe(mesh.geometry);
    expect(shell.scale.equals(new Vector3(1, 1, 1))).toBe(true);
    expect(new Box3().setFromObject(mesh).equals(before)).toBe(true);
    expect(shell.material).toBeInstanceOf(MeshBasicNodeMaterial);
    expect((shell.material as MeshBasicNodeMaterial).positionNode).toBeTruthy();
    const hits: never[] = [];
    shell.raycast(null as never, hits);
    expect(hits).toHaveLength(0);
    setShadows(mesh, { castShadow: true, receiveShadow: true });
    expect(mesh.castShadow).toBe(true);
    expect(shell.castShadow).toBe(false);
    expect(shell.receiveShadow).toBe(false);
  });

  it('preserves groups and suppresses opaque shells behind glass', () => {
    const mesh = new Mesh(new BoxGeometry(), [
      new MeshStandardMaterial(),
      new MeshStandardMaterial({ transparent: true, opacity: 0.4 }),
    ]);
    applyMaterial(mesh, { type: 'toon', outline: 0.012 });
    const shell = mesh.children[0] as Mesh;
    const materials = shell.material as MeshBasicNodeMaterial[];
    expect(materials).toHaveLength(2);
    expect(materials[0]!.visible).toBe(true);
    expect(materials[1]!.visible).toBe(false);
  });

  it('releases old ramp/material but retains original textures when swapping', () => {
    const map = new Texture();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map }));
    const source = mesh.material;
    applyMaterial(mesh, { type: 'toon' });
    const toon = mesh.material as unknown as MeshToonMaterial;
    const dispose = vi.spyOn(toon, 'dispose');
    const rampDispose = vi.spyOn(toon.gradientMap!, 'dispose');
    const mapDispose = vi.spyOn(map, 'dispose');
    applyMaterial(mesh, { type: 'toon', gradientSteps: 4 });
    expect(dispose).toHaveBeenCalledOnce();
    expect(rampDispose).toHaveBeenCalledOnce();
    expect(mapDispose).not.toHaveBeenCalled();
    clearMaterial(mesh);
    expect(mesh.material).toBe(source);
  });

  it('copies the effective preset for late-created model parts', () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const config = { type: 'toon' as const, gradientSteps: 3, outline: 0.012 };
    applyMaterial(mesh, config);
    config.outline = 0.1;
    expect(mesh.userData.cortexMaterialConfig.outline).toBe(0.012);
    clearMaterial(mesh);
    expect(mesh.userData.cortexMaterialConfig).toEqual({ type: 'standard' });
  });

  it('does not duplicate trimesh colliders for decorative hulls', async () => {
    const physics = await RapierPhysics.create();
    try {
      const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
      applyMaterial(mesh, { type: 'toon', outline: 0.02 });
      physics.addTrimeshFromObject(mesh);
      let colliders = 0;
      physics.world.forEachCollider(() => colliders++);
      expect(colliders).toBe(1);
    } finally { physics.dispose(); }
  });
});
