/**
 * SPEC-0697 §3 — `hotReloadModel(url)`: troca os filhos das raízes vivas mantendo a
 * raiz, reaplica o look gravado, pula raiz animada/presa a ECS, despeja o cache e deixa
 * o GLTF velho para o clearSceneAssetCaches (pode ter usuário fora do registro). AssetLoader e o registro de
 * scripts vivos são mockados (sem rede, sem ScriptHostSystem de verdade).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import type { ScriptSlot, ScriptComponent } from '../../src/components/ScriptComponent.js';

const h = vi.hoisted(() => ({
  loadGLTF: vi.fn<(url: string) => Promise<unknown>>(),
  evict: vi.fn<(url: string) => void>(),
  slots: [] as { slot: unknown; comp: unknown }[],
}));

vi.mock('../../src/core/AssetLoader.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/AssetLoader.js')>();
  class FakeAssetLoader {
    loadGLTF = h.loadGLTF;
    evict = h.evict;
    disposeCache = vi.fn();
  }
  return { ...mod, AssetLoader: FakeAssetLoader };
});

vi.mock('../../src/systems/ScriptHostSystem.js', () => ({
  forEachLiveScriptSlot: (cb: (slot: unknown, comp: unknown, entity: unknown) => void) => {
    for (const { slot, comp } of h.slots) cb(slot, comp, null);
  },
}));

const { loadGLB, instance, setMatte, setShadows, setFog, clearSceneAssetCaches } = await import(
  '../../src/scene/SceneAssets.js'
);
const { applyMaterial } = await import('../../src/scene/Materials.js');
const { enableModelHotReload, modelRootsOf } = await import('../../src/scene/modelHotRegistry.js');
const { hotReloadModel, onModelHotReload } = await import('../../src/scene/ModelHotReload.js');
const { Object3DComponent } = await import('../../src/components/Object3DComponent.js');
const { ScriptBehavior } = await import('../../src/scripts/ScriptBehavior.js');

enableModelHotReload();

function fakeGltf(name: string, animated = false) {
  const geo = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.2 }));
  mesh.name = name;
  const scene = new THREE.Group();
  scene.add(mesh);
  const animations = animated ? [new THREE.AnimationClip('idle', 1, [])] : [];
  return { gltf: { scene, animations }, geo };
}

/** Carrega `url` (v1) com o loader respondendo v1 e depois v2; devolve as raízes na cena. */
async function spawn(url: string, count = 1, v2 = fakeGltf('v2')) {
  const v1 = fakeGltf('v1');
  h.loadGLTF.mockResolvedValueOnce(v1.gltf).mockResolvedValueOnce(v2.gltf);
  const scene = new THREE.Scene();
  const gltf = await loadGLB(url);
  const roots = Array.from({ length: count }, () => scene.add(instance(gltf)).children.at(-1)!);
  return { scene, roots, v1, v2 };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.slots.length = 0;
});

afterEach(() => {
  clearSceneAssetCaches();
  vi.restoreAllMocks();
});

describe('hotReloadModel (SPEC-0697)', () => {
  it('mantém a raiz (userData incluso) e troca os filhos', async () => {
    const { roots } = await spawn('assets/car.glb');
    const root = roots[0]!;
    root.userData['cortexVehicle'] = true;
    const res = await hotReloadModel('assets/car.glb');
    expect(res).toEqual({ url: 'assets/car.glb', swapped: 1, skipped: [] });
    expect(root.children.map((c) => c.name)).toEqual(['v2']);
    expect(root.userData['cortexVehicle']).toBe(true);
  });

  it('reaplica o look na ordem gravada (matte → material → fog, sombra merge)', async () => {
    const { roots } = await spawn('assets/look.glb');
    const root = roots[0]!;
    setMatte(root);
    setShadows(root, { castShadow: false });
    applyMaterial(root, { type: 'unlit' });
    setFog(root, false);
    await hotReloadModel('assets/look.glb');
    const mesh = root.children[0] as THREE.Mesh;
    expect(mesh.name).toBe('v2');
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    expect(mat.isMeshBasicMaterial).toBe(true); // unlit veio depois do matte
    expect(mat.fog).toBe(false); // fog caiu no preset final
    expect((root.userData['cortexLook'] as { kind: string }[]).map((e) => e.kind)).toEqual([
      'shadows',
      'matte',
      'material',
      'fog',
    ]);
  });

  it('pula raiz animada e raiz presa a ECS com aviso, e não libera o GLTF velho', async () => {
    const { roots, v1 } = await spawn('assets/mix.glb', 3);
    const [animated, bound, free] = roots as [THREE.Object3D, THREE.Object3D, THREE.Object3D];
    animated.userData['cortexAnim'] = {};
    new Object3DComponent(bound);
    animated.name = 'bau';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dispose = vi.spyOn(v1.geo, 'dispose');
    const res = await hotReloadModel('assets/mix.glb');
    expect(res.swapped).toBe(1);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped[0]!.reason).toContain('bau');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(animated.children[0]!.name).toBe('v1');
    expect(bound.children[0]!.name).toBe('v1');
    expect(free.children[0]!.name).toBe('v2');
    expect(dispose).not.toHaveBeenCalled();
  });

  it('pula todas as raízes se o GLB novo tem clipes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { roots } = await spawn('assets/anim.glb', 1, fakeGltf('v2', true));
    const res = await hotReloadModel('assets/anim.glb');
    expect(res.swapped).toBe(0);
    expect(roots[0]!.children[0]!.name).toBe('v1');
  });

  it('GLTF velho não é liberado na troca (vegetação usa a fonte fora da cena); o clearSceneAssetCaches libera', async () => {
    const v1 = fakeGltf('v1');
    h.loadGLTF.mockResolvedValueOnce(v1.gltf);
    instance(await loadGLB('assets/veg.glb')); // fonte da vegetação: nunca vai para a cena
    const dispose = vi.spyOn(v1.geo, 'dispose');
    expect((await hotReloadModel('assets/veg.glb')).swapped).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
    clearSceneAssetCaches();
    expect(dispose).toHaveBeenCalled();
  });

  it('filho que o jogo prendeu na raiz fica; só os do GLB trocam', async () => {
    const { roots } = await spawn('assets/hero.glb');
    const root = roots[0]!;
    const light = new THREE.PointLight();
    root.add(light);
    const cb = vi.fn();
    const off = onModelHotReload(cb);
    await hotReloadModel('assets/hero.glb');
    off();
    expect(root.children.map((c) => c.name)).toEqual(['', 'v2']);
    expect(root.children[0]).toBe(light);
    expect(cb.mock.calls[0]![0].oldChildren.map((c: THREE.Object3D) => c.name)).toEqual(['v1']);
  });

  it('despeja os dois caches: loadGLB devolve o GLTF novo sem nova carga', async () => {
    const { v2 } = await spawn('assets/tree.glb');
    await hotReloadModel('assets/tree.glb');
    expect(h.evict).toHaveBeenCalledWith('assets/tree.glb');
    expect(await loadGLB('assets/tree.glb')).toBe(v2.gltf);
    expect(h.loadGLTF).toHaveBeenCalledTimes(2);
  });

  it('normaliza a URL: carregado como ./x, recarregado como /x?t=', async () => {
    const { roots } = await spawn('./assets/norm.glb');
    const res = await hotReloadModel('/assets/norm.glb?t=123');
    expect(res.url).toBe('assets/norm.glb');
    expect(res.swapped).toBe(1);
    expect(h.loadGLTF).toHaveBeenLastCalledWith('./assets/norm.glb');
    expect(roots[0]!.children[0]!.name).toBe('v2');
  });

  it('poda raiz fora da cena sem trocá-la', async () => {
    const { scene, roots } = await spawn('assets/gone.glb', 2);
    scene.remove(roots[0]!);
    const res = await hotReloadModel('assets/gone.glb');
    expect(res.swapped).toBe(1);
    expect(roots[0]!.children[0]!.name).toBe('v1');
    expect(modelRootsOf('assets/gone.glb')?.has(roots[0]!)).toBe(false);
  });

  it('callbacks recebem root e oldChildren; o cancelamento desliga', async () => {
    const { roots } = await spawn('assets/cb.glb');
    const oldChild = roots[0]!.children[0]!;
    const cb = vi.fn();
    const off = onModelHotReload(cb);
    await hotReloadModel('assets/cb.glb');
    expect(cb).toHaveBeenCalledWith({ url: 'assets/cb.glb', root: roots[0], oldChildren: [oldChild] });
    off();
    h.loadGLTF.mockResolvedValueOnce(fakeGltf('v3').gltf);
    await hotReloadModel('assets/cb.glb');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('script anexado à raiz volta a ter o raycast desligado nas malhas novas', async () => {
    const { roots } = await spawn('assets/coin.glb');
    const root = roots[0]!;
    class Coin extends ScriptBehavior {
      off(): void {
        this.disableRaycast(root);
      }
    }
    const coin = new Coin();
    coin.off();
    h.slots.push({ slot: { instance: coin } as unknown as ScriptSlot, comp: { object: root } as ScriptComponent });
    await hotReloadModel('assets/coin.glb');
    const mesh = root.children[0]!;
    expect(mesh.name).toBe('v2');
    expect(Object.prototype.hasOwnProperty.call(mesh, 'raycast')).toBe(true);
    coin.restoreRaycasts();
    expect(Object.prototype.hasOwnProperty.call(mesh, 'raycast')).toBe(false);
  });

  it('save duplo: as trocas da mesma URL rodam em série', async () => {
    const { roots, v2 } = await spawn('assets/twice.glb');
    h.loadGLTF.mockResolvedValueOnce(fakeGltf('v3').gltf);
    const disposeV2 = vi.spyOn(v2.geo, 'dispose');
    const [a, b] = await Promise.all([hotReloadModel('assets/twice.glb'), hotReloadModel('./assets/twice.glb')]);
    expect(a.swapped + b.swapped).toBe(2);
    expect(roots[0]!.children.map((c) => c.name)).toEqual(['v3']);
    // Em paralelo a 2ª troca não acharia o v2 no cache (ainda carregando) e ele vazaria:
    // em série ele vira órfão e o clearSceneAssetCaches o libera.
    expect(disposeV2).not.toHaveBeenCalled();
    clearSceneAssetCaches();
    expect(disposeV2).toHaveBeenCalled();
  });
});
