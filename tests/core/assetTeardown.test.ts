/**
 * SPEC-0152 — despejo de caches e teardown de PostFX.
 *
 * 1. `disposeObjectResources`: dispõe geometria (incluindo BVH pendurada),
 *    materiais/texturas e `InstancedMesh` de uma árvore fora da cena.
 * 2. `AssetLoader.disposeCache`: libera cada tipo de asset cacheado (textura,
 *    GLTF, FBX/Group, áudio via `free?.()`) e esvazia o cache.
 * 3. `Game.setPostFX`/`Game.reset`: o PostFX anterior é disposto na troca e o
 *    reset chama o nudge de GC do host (`__cortexGC`) quando existir.
 *    (Game é exercitado via `Object.create(Game.prototype)` — construir um
 *    Game real exige canvas/WebGPU, que não existem no ambiente node.)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { AssetLoader, disposeObjectResources } from '../../src/core/AssetLoader.js';
import { Game } from '../../src/core/Game.js';
import { PostFX } from '../../src/core/PostFX.js';
import { Scene } from '../../src/core/Scene.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── disposeObjectResources ──────────────────────────────────────────────────

describe('disposeObjectResources (SPEC-0152)', () => {
  it('dispõe geometria, BVH, material, texturas e InstancedMesh', () => {
    const geo = new THREE.BufferGeometry();
    const disposeBoundsTree = vi.fn(() => {
      (geo as unknown as { boundsTree?: unknown }).boundsTree = undefined;
    });
    Object.assign(geo, { boundsTree: {}, disposeBoundsTree });
    const geoDispose = vi.spyOn(geo, 'dispose');

    const tex = new THREE.Texture();
    const texDispose = vi.spyOn(tex, 'dispose');
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const matDispose = vi.spyOn(mat, 'dispose');

    const inst = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);
    const instDispose = vi.spyOn(inst, 'dispose');

    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, mat));
    root.add(inst);

    disposeObjectResources(root);

    expect(disposeBoundsTree).toHaveBeenCalledTimes(1);
    expect(geoDispose).toHaveBeenCalled();
    expect(texDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    expect(instDispose).toHaveBeenCalled();
  });
});

// ─── AssetLoader.disposeCache ────────────────────────────────────────────────

describe('AssetLoader.disposeCache (SPEC-0152)', () => {
  /** Semeia o cache privado direto — carregar de verdade exigiria rede. */
  function seed(loader: AssetLoader, url: string, asset: unknown): void {
    (loader as unknown as { _cache: Map<string, unknown> })._cache.set(url, asset);
  }

  it('libera textura, GLTF, FBX e áudio (free) e esvazia o cache', () => {
    const loader = new AssetLoader();

    const tex = new THREE.Texture();
    const texDispose = vi.spyOn(tex, 'dispose');

    const gltfGeo = new THREE.BufferGeometry();
    const gltfGeoDispose = vi.spyOn(gltfGeo, 'dispose');
    const gltfScene = new THREE.Group();
    gltfScene.add(new THREE.Mesh(gltfGeo, new THREE.MeshBasicMaterial()));

    const fbx = new THREE.Group();
    const fbxGeo = new THREE.BufferGeometry();
    const fbxGeoDispose = vi.spyOn(fbxGeo, 'dispose');
    fbx.add(new THREE.Mesh(fbxGeo, new THREE.MeshBasicMaterial()));

    // AudioBuffer do host nativo: objeto plano com free() (ADR-0153).
    const audio = { duration: 1, free: vi.fn() };

    seed(loader, 'a.png', tex);
    seed(loader, 'b.glb', { scene: gltfScene, animations: [] });
    seed(loader, 'c.fbx', fbx);
    seed(loader, 'd.ogg', audio);
    expect(loader.cacheSize).toBe(4);

    loader.disposeCache();

    expect(texDispose).toHaveBeenCalled();
    expect(gltfGeoDispose).toHaveBeenCalled();
    expect(fbxGeoDispose).toHaveBeenCalled();
    expect(audio.free).toHaveBeenCalledTimes(1);
    expect(loader.cacheSize).toBe(0);
  });

  it('AudioBuffer do browser (sem free) não quebra o despejo', () => {
    const loader = new AssetLoader();
    seed(loader, 'e.mp3', { duration: 2 }); // sem free()
    expect(() => loader.disposeCache()).not.toThrow();
    expect(loader.cacheSize).toBe(0);
  });
});

// ─── Game: PostFX + nudge de GC no reset ─────────────────────────────────────

/** Game "oco" sobre o prototype real — só os campos que setPostFX/reset usam. */
type BareGame = Pick<Game, 'setPostFX' | 'reset'> & { _postfx: unknown };
function bareGame(): BareGame {
  const g = Object.create(Game.prototype) as Record<string, unknown>;
  g['_postfx'] = null;
  g['_loop'] = { stop: vi.fn() };
  g['world'] = { clear: vi.fn() };
  g['scene'] = { disposeAll: vi.fn() };
  g['renderer'] = { threeRenderer: {} }; // caches internos: optional chaining no-op
  g['_ui'] = { clear: vi.fn() };
  g['_onUpdate'] = null;
  return g as unknown as BareGame;
}

describe('Game.setPostFX / Game.reset (SPEC-0152)', () => {
  it('setPostFX dispõe o pipeline anterior ao trocar', () => {
    const g = bareGame();
    const oldFx = { render: vi.fn(), dispose: vi.fn() };
    const newFx = { render: vi.fn(), dispose: vi.fn() };
    g.setPostFX(oldFx);
    g.setPostFX(newFx);
    expect(oldFx.dispose).toHaveBeenCalledTimes(1);
    expect(newFx.dispose).not.toHaveBeenCalled();
  });

  it('setPostFX com a MESMA instância não a dispõe (idempotente)', () => {
    const g = bareGame();
    const fx = { render: vi.fn(), dispose: vi.fn() };
    g.setPostFX(fx);
    g.setPostFX(fx);
    expect(fx.dispose).not.toHaveBeenCalled();
  });

  it('reset() dispõe o PostFX da fase e chama o nudge de GC do host', () => {
    const gc = vi.fn();
    vi.stubGlobal('__cortexGC', gc);
    const g = bareGame();
    const fx = { render: vi.fn(), dispose: vi.fn() };
    g.setPostFX(fx);

    g.reset();

    expect(fx.dispose).toHaveBeenCalledTimes(1);
    expect(g._postfx).toBeNull();
    expect(gc).toHaveBeenCalledTimes(1);
  });

  it('reset() sem __cortexGC (browser) não quebra', () => {
    const g = bareGame();
    expect(() => g.reset()).not.toThrow();
  });
});

// ─── PostFX nativo: dono do estado global do host ────────────────────────────

describe('PostFX nativo: dono do estado global (SPEC-0152)', () => {
  it('dispose do PostFX ANTIGO não apaga a config que o NOVO acabou de aplicar', () => {
    // O estado do pós-FX nativo é global (C++): num swap direto o construtor do
    // novo roda ANTES do dispose do antigo — o dispose só pode desligar o host
    // se este PostFX ainda for o dono.
    const native = vi.fn();
    vi.stubGlobal('__cortexBloom', native);
    const renderer = { threeRenderer: { toneMappingExposure: 1 } };
    const scene = { getThreeScene: () => new THREE.Scene() };
    const cam = new THREE.PerspectiveCamera();

    const fx1 = new PostFX(renderer as never, scene as never, cam, { bloom: true });
    const fx2 = new PostFX(renderer as never, scene as never, cam, { bloom: true });
    native.mockClear();

    fx1.dispose(); // fx2 é o dono agora — não pode desligar o host
    expect(native).not.toHaveBeenCalled();

    fx2.dispose(); // o dono desliga
    expect(native).toHaveBeenCalledWith(null);
  });

  it('dispose (browser) dispõe o pass da cena, a pirâmide do bloom E o pipeline', () => {
    // O RenderPipeline.dispose() do three só solta o material do quad — as RTs
    // reais (HDR do pass + pirâmide do bloom) têm dispose próprio que o PostFX
    // TEM que chamar. Era o "GPU sobe a cada reabertura de fase" no Studio.
    // (Instância via prototype: construir o grafo TSL real exige renderer WebGPU.)
    const fx = Object.create(PostFX.prototype) as PostFX;
    const scenePass = { dispose: vi.fn() };
    const bloomNode = { dispose: vi.fn() };
    const pipeline = { dispose: vi.fn() };
    Object.assign(fx as unknown as Record<string, unknown>, {
      _native: null,
      _scenePass: scenePass,
      _bloom: bloomNode,
      _pipeline: pipeline,
    });

    fx.dispose();

    expect(scenePass.dispose).toHaveBeenCalledTimes(1);
    expect(bloomNode.dispose).toHaveBeenCalledTimes(1);
    expect(pipeline.dispose).toHaveBeenCalledTimes(1);
  });
});

// ─── Scene.disposeAll: luz (shadow map) e skeleton (boneTexture) ─────────────

describe('Scene.disposeAll: luz e skeleton (SPEC-0152)', () => {
  it('dispõe a luz (RT do shadow map) e o skeleton do SkinnedMesh', () => {
    const scene = new Scene();
    const light = new THREE.DirectionalLight();
    const lightDispose = vi.spyOn(light, 'dispose');

    const skinned = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    skinned.bind(new THREE.Skeleton([new THREE.Bone()]));
    const skeletonDispose = vi.spyOn(skinned.skeleton, 'dispose');

    scene.add(light);
    scene.add(skinned);
    scene.disposeAll();

    expect(lightDispose).toHaveBeenCalledTimes(1);
    expect(skeletonDispose).toHaveBeenCalledTimes(1);
  });

  it('dispõe o shadowNode CUSTOMIZADO da luz (CSM) antes do dispose da luz', () => {
    const scene = new Scene();
    const light = new THREE.DirectionalLight();
    const csm = { dispose: vi.fn() };
    (light.shadow as unknown as { shadowNode: unknown }).shadowNode = csm;

    scene.add(light);
    scene.disposeAll();

    expect(csm.dispose).toHaveBeenCalledTimes(1);
  });

  it('dispõe o BACKGROUND quando é textura (skybox) — dispara o listener do cubo', () => {
    const scene = new Scene();
    const sky = new THREE.Texture();
    const skyDispose = vi.spyOn(sky, 'dispose');
    scene.getThreeScene().background = sky;

    scene.disposeAll();

    expect(skyDispose).toHaveBeenCalledTimes(1);
    expect(scene.getThreeScene().background).toBeNull();
  });

  it('dispõe a RT do PMREM próprio (setEnvironment) no disposeAll', () => {
    const scene = new Scene();
    // Injeta a RT direto (gerar de verdade exige renderer WebGPU inicializado).
    const rt = { texture: new THREE.Texture(), dispose: vi.fn() };
    (scene as unknown as { _envRT: unknown })._envRT = rt;

    scene.disposeAll();

    expect(rt.dispose).toHaveBeenCalledTimes(1);
    expect((scene as unknown as { _envRT: unknown })._envRT).toBeNull();
  });
});
