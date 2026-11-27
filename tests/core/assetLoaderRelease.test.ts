/**
 * SPEC-0753 — o `AssetLoader` divide a carga em andamento, solta uma URL e fecha as imagens decodificadas.
 *
 * Os loaders do three ficam nos campos privados do `AssetLoader`; o teste troca cada um por um falso (carregar de
 * verdade exigiria rede). `disposeObjectResources` é o real.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AssetLoader, disposeObjectResources } from '../../src/core/AssetLoader.js';

/** Os loaders privados que o teste troca. */
type LoaderField = '_gltfLoader' | '_textureLoader' | '_fbxLoader' | '_audioLoader';

/** Troca o loader privado `field` por um `loadAsync` falso. */
function stub(loader: AssetLoader, field: LoaderField, loadAsync: (url: string) => Promise<unknown>) {
  const fn = vi.fn(loadAsync);
  (loader as unknown as Record<LoaderField, unknown>)[field] = { loadAsync: fn };
  return fn;
}

/** Imagem decodificada falsa com `close()` (o `ImageBitmap`). */
function fakeImage() {
  return { width: 4, height: 4, close: vi.fn() };
}

/** GLTF falso: uma malha com textura de imagem fechável. */
function fakeGltf() {
  const image = fakeImage();
  const tex = new THREE.Texture(image as never);
  const geo = new THREE.BufferGeometry();
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));
  return { gltf: { scene, animations: [] }, tex, geo, image };
}

/** Promessa com o resolve/reject à mão. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AssetLoader: carga em andamento dividida (SPEC-0753)', () => {
  it('duas chamadas paralelas do mesmo GLB carregam uma vez e recebem o mesmo GLTF', async () => {
    const loader = new AssetLoader();
    const { gltf } = fakeGltf();
    const gate = deferred<unknown>();
    const load = stub(loader, '_gltfLoader', () => gate.promise);
    const a = loader.loadGLTF('a.glb');
    const b = loader.loadGLTF('a.glb');
    gate.resolve(gltf);
    const [ra, rb] = await Promise.all([a, b]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(ra).toBe(gltf);
    expect(rb).toBe(gltf);
    expect(loader.cacheSize).toBe(1);
  });

  it('a falha sai do mapa e a próxima chamada tenta de novo', async () => {
    const loader = new AssetLoader();
    const { gltf } = fakeGltf();
    const load = stub(loader, '_gltfLoader', vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue(gltf));
    await expect(Promise.all([loader.loadGLTF('a.glb'), loader.loadGLTF('a.glb')])).rejects.toThrow('rede');
    expect(load).toHaveBeenCalledTimes(1);
    await expect(loader.loadGLTF('a.glb')).resolves.toBe(gltf);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('um throw síncrono do loader rejeita sem deixar a URL presa', async () => {
    const loader = new AssetLoader();
    const texture = new THREE.Texture();
    let calls = 0;
    stub(loader, '_textureLoader', () => {
      calls += 1;
      if (calls === 1) throw new Error('síncrono');
      return Promise.resolve(texture);
    });
    await expect(loader.loadTexture('t.png')).rejects.toThrow('síncrono');
    await expect(loader.loadTexture('t.png')).resolves.toBe(texture);
  });

  it('textura, FBX e áudio também dividem a carga em andamento', async () => {
    const loader = new AssetLoader();
    const tex = stub(loader, '_textureLoader', async () => new THREE.Texture());
    const fbx = stub(loader, '_fbxLoader', async () => new THREE.Group());
    const audio = stub(loader, '_audioLoader', async () => ({ duration: 1 }));
    await Promise.all([loader.loadTexture('t.png'), loader.loadTexture('t.png', { pixelated: true })]);
    await Promise.all([loader.loadFBX('m.fbx'), loader.loadFBX('m.fbx')]);
    await Promise.all([loader.loadAudio('s.ogg'), loader.loadAudio('s.ogg')]);
    expect(tex).toHaveBeenCalledTimes(1);
    expect(fbx).toHaveBeenCalledTimes(1);
    expect(audio).toHaveBeenCalledTimes(1);
    expect(loader.cacheSize).toBe(3);
  });
});

describe('AssetLoader.release (SPEC-0753)', () => {
  it('GLTF: dispõe geometria e textura, fecha a imagem e a próxima carga vai à rede', async () => {
    const loader = new AssetLoader();
    const { gltf, tex, geo, image } = fakeGltf();
    const load = stub(loader, '_gltfLoader', async () => gltf);
    const texDispose = vi.spyOn(tex, 'dispose');
    const geoDispose = vi.spyOn(geo, 'dispose');
    await loader.loadGLTF('a.glb');
    expect(loader.release('a.glb')).toBe(true);
    expect(texDispose).toHaveBeenCalled();
    expect(geoDispose).toHaveBeenCalled();
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(loader.cacheSize).toBe(0);
    await loader.loadGLTF('a.glb');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('textura: dispose e fecha a imagem', async () => {
    const loader = new AssetLoader();
    const image = fakeImage();
    const texture = new THREE.Texture(image as never);
    const dispose = vi.spyOn(texture, 'dispose');
    stub(loader, '_textureLoader', async () => texture);
    await loader.loadTexture('t.png');
    expect(loader.release('t.png')).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it('FBX: dispõe o grupo e fecha as imagens', async () => {
    const loader = new AssetLoader();
    const image = fakeImage();
    const group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    const geoDispose = vi.spyOn(geo, 'dispose');
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.Texture(image as never) })));
    stub(loader, '_fbxLoader', async () => group);
    await loader.loadFBX('m.fbx');
    expect(loader.release('m.fbx')).toBe(true);
    expect(geoDispose).toHaveBeenCalled();
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it('áudio: chama o free() do buffer do host', async () => {
    const loader = new AssetLoader();
    const buffer = { duration: 1, free: vi.fn() };
    stub(loader, '_audioLoader', async () => buffer);
    await loader.loadAudio('s.ogg');
    expect(loader.release('s.ogg')).toBe(true);
    expect(buffer.free).toHaveBeenCalledTimes(1);
  });

  it('URL nunca pedida ou ainda em carga devolve false e não mexe em nada', async () => {
    const loader = new AssetLoader();
    const { gltf, image } = fakeGltf();
    const gate = deferred<unknown>();
    stub(loader, '_gltfLoader', () => gate.promise);
    expect(loader.release('nunca.glb')).toBe(false);
    const pending = loader.loadGLTF('a.glb');
    expect(loader.release('a.glb')).toBe(false);
    gate.resolve(gltf);
    await expect(pending).resolves.toBe(gltf);
    expect(loader.cacheSize).toBe(1);
    expect(image.close).not.toHaveBeenCalled();
  });
});

describe('disposeObjectResources com closeImages (SPEC-0753)', () => {
  it('fecha cada imagem uma vez, mesmo dividida por texturas clonadas', () => {
    const image = fakeImage();
    const tex = new THREE.Texture(image as never);
    const twin = tex.clone(); // divide a `source`
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex })));
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: twin })));
    disposeObjectResources(root, { closeImages: true });
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it('sem a opção (e no disposeCache) a imagem não é fechada, como antes', async () => {
    const { gltf, image } = fakeGltf();
    disposeObjectResources(gltf.scene);
    expect(image.close).not.toHaveBeenCalled();

    const loader = new AssetLoader();
    stub(loader, '_gltfLoader', async () => gltf);
    await loader.loadGLTF('a.glb');
    loader.disposeCache();
    expect(image.close).not.toHaveBeenCalled();
  });

  it('imagem sem close() (canvas, dado cru) não quebra', () => {
    const tex = new THREE.Texture({ width: 2, height: 2 } as never);
    const root = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex }));
    expect(() => disposeObjectResources(root, { closeImages: true })).not.toThrow();
  });
});
