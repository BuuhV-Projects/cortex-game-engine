/**
 * Testes dos helpers de posicionamento (src/scene/SceneAssets.ts).
 * Cobre: getWorldBounds (medição), placeOnGround (assenta base em y, centra em
 * x/z, aplica rotY/scale) e setShadows. Ver ADR-0039/0040.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshStandardMaterial, Group, Object3D } from 'three';
import {
  getWorldBounds,
  placeOnGround,
  setShadows,
  setMatte,
  clearMatte,
  isMatte,
  instance,
} from '../../src/scene/SceneAssets.js';

function box(size = 2): Mesh {
  return new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial());
}

describe('instance — frustum culling', () => {
  function fakeGltf(animated: boolean) {
    const scene = new Object3D();
    scene.add(box(1));
    return { scene, animations: animated ? [{} as never] : [] } as never;
  }
  function firstMesh(obj: Object3D): Mesh {
    let m: Mesh | null = null;
    obj.traverse((c) => { if (!m && (c as Mesh).isMesh) m = c as Mesh; });
    return m!;
  }

  it('recomputa a boundingSphere (evita esfera obsoleta → objeto some no centro)', () => {
    const obj = instance(fakeGltf(false));
    expect(firstMesh(obj).geometry.boundingSphere).not.toBeNull();
  });

  it('desliga frustumCulled em GLB ANIMADO (esfera estática não confiável; ex.: baú que abre)', () => {
    const animated = instance(fakeGltf(true));
    expect(firstMesh(animated).frustumCulled).toBe(false);
    // estático mantém o culling (default true)
    const stat = instance(fakeGltf(false));
    expect(firstMesh(stat).frustumCulled).toBe(true);
  });
});

describe('getWorldBounds', () => {
  it('mede o bounding box de um cubo na origem', () => {
    const b = getWorldBounds(box(2));
    expect(b.minX).toBeCloseTo(-1);
    expect(b.maxX).toBeCloseTo(1);
    expect(b.bottomY).toBeCloseTo(-1);
    expect(b.topY).toBeCloseTo(1);
    expect(b.size.x).toBeCloseTo(2);
    expect(b.center.y).toBeCloseTo(0);
  });
});

describe('placeOnGround', () => {
  it('assenta a base do objeto em y', () => {
    const b = placeOnGround(box(2), { y: 0 });
    expect(b.bottomY).toBeCloseTo(0);
    expect(b.topY).toBeCloseTo(2);
  });

  it('centra horizontalmente em (x, z)', () => {
    const b = placeOnGround(box(2), { x: 5, z: -3, y: 1 });
    expect(b.center.x).toBeCloseTo(5);
    expect(b.center.z).toBeCloseTo(-3);
    expect(b.bottomY).toBeCloseTo(1);
  });

  it('aplica escala antes de medir', () => {
    const b = placeOnGround(box(2), { y: 0, scale: 2 });
    expect(b.size.x).toBeCloseTo(4);
    expect(b.topY).toBeCloseTo(4); // base em 0, altura 4
  });

  it('funciona com pivô deslocado (assenta a geometria, não o pivô)', () => {
    // Grupo com o mesh deslocado +10 em Y dentro dele: o "pivô" (origem do grupo)
    // não bate com a geometria. placeOnGround deve assentar a GEOMETRIA em y=0.
    const group = new Group();
    const mesh = box(2);
    mesh.position.y = 10;
    group.add(mesh);
    const b = placeOnGround(group, { y: 0 });
    expect(b.bottomY).toBeCloseTo(0);
    expect(b.topY).toBeCloseTo(2);
  });
});

describe('setShadows', () => {
  it('liga/desliga sombras nos meshes do objeto', () => {
    const m = box(2);
    setShadows(m, { castShadow: false, receiveShadow: true });
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(true);
    setShadows(m, { castShadow: true });
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(true); // não alterado
  });
});

describe('setMatte', () => {
  it('zera specular/reflexo (roughness=1, metalness=0, envMapIntensity=0)', () => {
    const mat = new MeshStandardMaterial({ roughness: 0.1, metalness: 0.8 });
    mat.envMapIntensity = 1;
    setMatte(new Mesh(new BoxGeometry(), mat));
    expect(mat.roughness).toBe(1);
    expect(mat.metalness).toBe(0);
    expect(mat.envMapIntensity).toBe(0);
  });

  it('aceita overrides e percorre arrays de material', () => {
    const a = new MeshStandardMaterial({ roughness: 0 });
    const b = new MeshStandardMaterial({ roughness: 0 });
    setMatte(new Mesh(new BoxGeometry(), [a, b]), { roughness: 0.7 });
    expect(a.roughness).toBeCloseTo(0.7);
    expect(b.roughness).toBeCloseTo(0.7);
  });

  it('não quebra em objeto sem mesh', () => {
    expect(() => setMatte(new Group())).not.toThrow();
  });

  it('clearMatte restaura os valores originais (toggle on/off)', () => {
    const mat = new MeshStandardMaterial({ roughness: 0.2, metalness: 0.6 });
    mat.envMapIntensity = 0.9;
    const mesh = new Mesh(new BoxGeometry(), mat);
    expect(isMatte(mesh)).toBe(false);
    setMatte(mesh);
    expect(isMatte(mesh)).toBe(true);
    expect(mat.roughness).toBe(1);
    clearMatte(mesh);
    expect(isMatte(mesh)).toBe(false);
    expect(mat.roughness).toBeCloseTo(0.2);
    expect(mat.metalness).toBeCloseTo(0.6);
    expect(mat.envMapIntensity).toBeCloseTo(0.9);
  });
});
