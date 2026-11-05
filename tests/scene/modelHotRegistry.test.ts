/**
 * SPEC-0697 §3 — registro do hot reload de GLB: desligado não grava nada; ligado,
 * registra raízes e grava o `cortexLook` em ordem (mesmo kind substitui, o "desfazer"
 * remove). O AssetLoader é mockado (sem rede).
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

const h = vi.hoisted(() => ({ loadGLTF: vi.fn<(url: string) => Promise<unknown>>() }));

vi.mock('../../src/core/AssetLoader.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/AssetLoader.js')>();
  class FakeAssetLoader {
    loadGLTF = h.loadGLTF;
    evict = vi.fn();
    disposeCache = vi.fn();
  }
  return { ...mod, AssetLoader: FakeAssetLoader };
});

const { loadGLB, instance, setMatte, clearMatte, setShadows, setFog } = await import('../../src/scene/SceneAssets.js');
const { applyMaterial, clearMaterial } = await import('../../src/scene/Materials.js');
const reg = await import('../../src/scene/modelHotRegistry.js');

function fakeGltf() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()));
  return { scene, animations: [] };
}

const kinds = (o: THREE.Object3D) => (o.userData['cortexLook'] as { kind: string }[]).map((e) => e.kind);

describe('modelHotRegistry (SPEC-0697)', () => {
  // Precisa vir antes de qualquer enable: a flag é de módulo e só liga.
  it('desligado: nenhuma raiz registrada e nada em userData', async () => {
    h.loadGLTF.mockResolvedValueOnce(fakeGltf());
    const root = instance(await loadGLB('assets/off.glb'));
    setMatte(root);
    setShadows(root, { castShadow: false });
    setFog(root, false);
    applyMaterial(root, { type: 'unlit' });
    expect(reg.isModelHotReloadEnabled()).toBe(false);
    expect(reg.modelRootsOf('assets/off.glb')).toBeUndefined();
    expect(root.userData['cortexModelUrl']).toBeUndefined();
    expect(root.userData['cortexLook']).toBeUndefined();
  });

  it('normaliza a URL: sem ./, / inicial, query nem hash', () => {
    expect(reg.normalizeModelUrl('./assets/a.glb?t=1')).toBe('assets/a.glb');
    expect(reg.normalizeModelUrl('/assets/a.glb#x')).toBe('assets/a.glb');
    expect(reg.normalizeModelUrl('assets\\b.glb')).toBe('assets/b.glb');
  });

  it('ligado: instance registra a raiz pela URL e grava a sombra default', async () => {
    reg.enableModelHotReload();
    h.loadGLTF.mockResolvedValueOnce(fakeGltf());
    const root = instance(await loadGLB('./assets/on.glb'));
    expect(root.userData['cortexModelUrl']).toBe('assets/on.glb');
    expect(reg.modelRootsOf('assets/on.glb')?.has(root)).toBe(true);
    expect(root.userData['cortexLook']).toEqual([
      { kind: 'shadows', args: [{ castShadow: true, receiveShadow: true }] },
    ]);
  });

  it('look em ordem: mesmo kind substitui no lugar, sombra parcial faz merge, desfazer remove', async () => {
    h.loadGLTF.mockResolvedValueOnce(fakeGltf());
    const root = instance(await loadGLB('assets/look.glb'));
    setMatte(root);
    applyMaterial(root, { type: 'unlit' });
    setFog(root, false);
    setMatte(root, { roughness: 0.5 });
    setShadows(root, { castShadow: false });
    expect(kinds(root)).toEqual(['shadows', 'matte', 'material', 'fog']);
    const look = root.userData['cortexLook'] as { kind: string; args: unknown[] }[];
    expect(look[0]!.args[0]).toEqual({ castShadow: false, receiveShadow: true });
    expect(look[1]!.args[0]).toEqual({ roughness: 0.5 });

    clearMatte(root);
    clearMaterial(root);
    expect(kinds(root)).toEqual(['shadows', 'fog']);
    applyMaterial(root, { type: 'toon' });
    applyMaterial(root, { type: 'standard' }); // standard = desfazer
    expect(kinds(root)).toEqual(['shadows', 'fog']);
  });

  it('objeto que não é raiz de GLB não ganha look', () => {
    const plain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    setMatte(plain);
    expect(plain.userData['cortexLook']).toBeUndefined();
  });
});
