/**
 * Testes do sistema de materiais por objeto (src/scene/Materials.ts, ADR-0058):
 * swap não-destrutivo (unlit/toon) preservando o `map`, restauração via
 * `standard`/clearMaterial, contorno toon, e aplicação pelo buildScene.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial, MeshToonMaterial, Texture } from 'three';
import { applyMaterial, clearMaterial, getMaterialType } from '../../src/scene/Materials.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

function box(): Mesh {
  const mat = new MeshStandardMaterial({ color: 0x336699 });
  mat.map = new Texture();
  return new Mesh(new BoxGeometry(1, 1, 1), mat);
}

describe('applyMaterial', () => {
  it('unlit → MeshBasicMaterial preservando o map; standard restaura o original', () => {
    const mesh = box();
    const orig = mesh.material;
    const origMap = (orig as MeshStandardMaterial).map;

    applyMaterial(mesh, { type: 'unlit', color: 0xff8800 });
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect((mesh.material as MeshBasicMaterial).map).toBe(origMap); // map preservado
    expect(getMaterialType(mesh)).toBe('unlit');

    applyMaterial(mesh, { type: 'standard' });
    expect(mesh.material).toBe(orig); // restaurado (mesma instância)
    expect(getMaterialType(mesh)).toBe('standard');
  });

  it('unlit porta os knobs do shader Unity (cull→side, zwrite/ztest→depth)', () => {
    const mesh = box();
    applyMaterial(mesh, { type: 'unlit', cull: 'none', depthWrite: false, depthTest: false, opacity: 0.5 });
    const m = mesh.material as MeshBasicMaterial;
    expect(m.side).toBe(2); // DoubleSide
    expect(m.depthWrite).toBe(false);
    expect(m.depthTest).toBe(false);
    expect(m.transparent).toBe(true); // opacity < 1 liga transparência
    expect(m.opacity).toBeCloseTo(0.5);
  });

  it('toon → MeshToonMaterial; outline adiciona casca filha e standard a remove', () => {
    const mesh = box();
    applyMaterial(mesh, { type: 'toon', gradientSteps: 4, outline: 0.03 });
    expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
    expect(mesh.children.filter((c) => c.userData['cortexOutline'] === true)).toHaveLength(1);

    applyMaterial(mesh, { type: 'standard' });
    expect(mesh.children.filter((c) => c.userData['cortexOutline'] === true)).toHaveLength(0);
  });

  it('clearMaterial restaura sem precisar do preset standard', () => {
    const mesh = box();
    const orig = mesh.material;
    applyMaterial(mesh, { type: 'toon' });
    clearMaterial(mesh);
    expect(mesh.material).toBe(orig);
  });
});

describe('buildScene — campo material', () => {
  it('aplica o material do nó (primitive unlit)', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'primitive', id: 'b', shape: 'box', size: 1, material: { type: 'unlit', color: '#ff8800' } }],
    };
    const handle = await buildScene(new Scene(), def);
    const obj = handle.byId.get('b') as Mesh;
    expect(obj.material).toBeInstanceOf(MeshBasicMaterial);
    expect(getMaterialType(obj)).toBe('unlit');
  });
});
