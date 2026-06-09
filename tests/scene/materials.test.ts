/**
 * Testes do sistema de materiais por objeto (src/scene/Materials.ts, ADR-0058):
 * swap não-destrutivo (unlit/toon) preservando o `map`, restauração via
 * `standard`/clearMaterial, contorno toon, e aplicação pelo buildScene.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, Object3D, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial, MeshToonMaterial, Texture } from 'three';
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

  it('re-aplicar (mudar outline) NÃO remove o objeto do pai (regressão: objeto sumia)', () => {
    const parent = new Object3D();
    const mesh = box();
    parent.add(mesh);
    applyMaterial(mesh, { type: 'toon', outline: 0.02 });
    expect(mesh.parent).toBe(parent);
    // o fluxo que sumia: outline 0.02 → 0 reaplica o material (roda clearOutline)
    applyMaterial(mesh, { type: 'toon', outline: 0 });
    expect(mesh.parent).toBe(parent); // segue na cena
    expect(mesh.children.filter((c) => c.userData['cortexOutline'] === true)).toHaveLength(0);
    applyMaterial(mesh, { type: 'toon', outline: 0.02 });
    expect(mesh.parent).toBe(parent);
  });

  it('re-aplicar com cor nova mantém a textura original (não embranquece)', () => {
    const mesh = box();
    const origMap = (mesh.material as MeshStandardMaterial).map;
    applyMaterial(mesh, { type: 'toon' });
    applyMaterial(mesh, { type: 'toon', color: '#3366ff' });
    expect((mesh.material as MeshToonMaterial).map).toBe(origMap); // derivado do ORIGINAL
    applyMaterial(mesh, { type: 'unlit', color: '#ffffff' });
    expect((mesh.material as MeshBasicMaterial).map).toBe(origMap);
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

  it('overlay.data.material vence o material do nó (autoria do editor)', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'primitive', id: 'b', shape: 'box', size: 1, material: { type: 'standard' } }],
    };
    const overlay = { version: 1 as const, objects: {}, data: { material: { b: { type: 'toon', gradientSteps: 3 } } } };
    const handle = await buildScene(new Scene(), def, { overlay });
    const obj = handle.byId.get('b') as Mesh;
    expect(obj.material).toBeInstanceOf(MeshToonMaterial); // overlay (toon) venceu o nó (standard)
    expect(getMaterialType(obj)).toBe('toon');
  });
});
