/**
 * Testes do shadow caster culling (src/scene/ShadowCasterCulling.ts, SPEC-0197):
 * objeto pequeno e distante sai do shadow pass, a autoria (`castShadow: false`)
 * nunca é revertida, e skinned/instanced ficam de fora do filtro.
 */
import { describe, it, expect } from 'vitest';
import {
  Mesh,
  Object3D,
  BoxGeometry,
  MeshStandardMaterial,
  SkinnedMesh,
  InstancedMesh,
  Vector3,
} from 'three';
import {
  cullShadowCasters,
  shouldCastShadow,
  DEFAULT_SHADOW_CASTER_MIN_RATIO,
} from '../../src/scene/ShadowCasterCulling.js';

/** Malha de `size` metros posicionada a `x` metros da origem. */
function boxAt(x: number, size = 1): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial());
  mesh.position.set(x, 0, 0);
  mesh.castShadow = true;
  return mesh;
}

/** Cena com as matrizes de mundo já atualizadas (como dentro do frame). */
function sceneOf(...objects: Object3D[]): Object3D {
  const root = new Object3D();
  for (const obj of objects) root.add(obj);
  root.updateMatrixWorld(true);
  return root;
}

const CAMERA = new Vector3(0, 0, 0);

describe('shouldCastShadow', () => {
  it('mede tamanho ANGULAR: o mesmo objeto projeta perto e some longe', () => {
    expect(shouldCastShadow(1, 10, 0.02)).toBe(true); // ratio 0.1
    expect(shouldCastShadow(1, 100, 0.02)).toBe(false); // ratio 0.01
  });

  it('limiar 0 desliga o filtro', () => {
    expect(shouldCastShadow(0.01, 10000, 0)).toBe(true);
  });

  it('não divide por ~zero em cima da câmera', () => {
    expect(shouldCastShadow(1, 0, DEFAULT_SHADOW_CASTER_MIN_RATIO)).toBe(true);
  });
});

describe('cullShadowCasters', () => {
  it('tira a sombra do que é pequeno e distante, mantém o que está perto', () => {
    const near = boxAt(5); // raio ~0.87 a 5 m → ratio 0.17
    const far = boxAt(500); // raio ~0.87 a 500 m → ratio 0.0017
    const root = sceneOf(near, far);

    const stats = cullShadowCasters(root, CAMERA, DEFAULT_SHADOW_CASTER_MIN_RATIO);

    expect(near.castShadow).toBe(true);
    expect(far.castShadow).toBe(false);
    expect(stats).toEqual({ evaluated: 2, culled: 1 });
  });

  it('objeto GRANDE segue projetando à mesma distância que um pequeno perde', () => {
    const small = boxAt(300, 1);
    const big = boxAt(300, 60); // prédio
    const root = sceneOf(small, big);

    cullShadowCasters(root, CAMERA, DEFAULT_SHADOW_CASTER_MIN_RATIO);

    expect(small.castShadow).toBe(false);
    expect(big.castShadow).toBe(true);
  });

  it('a autoria vence: castShadow false no nó nunca volta a true', () => {
    const authored = boxAt(5);
    authored.castShadow = false; // o autor desligou
    const root = sceneOf(authored);

    cullShadowCasters(root, CAMERA, DEFAULT_SHADOW_CASTER_MIN_RATIO);
    expect(authored.castShadow).toBe(false);

    // E nem com o filtro desligado (que restaura a autoria) ele acende.
    cullShadowCasters(root, CAMERA, 0);
    expect(authored.castShadow).toBe(false);
  });

  it('limiar 0 restaura a sombra de quem o filtro havia cortado', () => {
    const far = boxAt(500);
    const root = sceneOf(far);

    cullShadowCasters(root, CAMERA, DEFAULT_SHADOW_CASTER_MIN_RATIO);
    expect(far.castShadow).toBe(false);

    cullShadowCasters(root, CAMERA, 0);
    expect(far.castShadow).toBe(true);
  });

  it('a câmera se aproximando devolve a sombra (reavaliação por frame)', () => {
    const mesh = boxAt(500);
    const root = sceneOf(mesh);

    cullShadowCasters(root, CAMERA, DEFAULT_SHADOW_CASTER_MIN_RATIO);
    expect(mesh.castShadow).toBe(false);

    cullShadowCasters(root, new Vector3(495, 0, 0), DEFAULT_SHADOW_CASTER_MIN_RATIO);
    expect(mesh.castShadow).toBe(true);
  });

  it('skinned e instanced ficam de fora (bounding sphere mente sobre o conjunto)', () => {
    const skinned = new SkinnedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    skinned.position.set(500, 0, 0);
    skinned.castShadow = true;
    const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 100);
    instanced.position.set(500, 0, 0);
    instanced.castShadow = true;
    const root = sceneOf(skinned, instanced);

    const stats = cullShadowCasters(root, CAMERA, DEFAULT_SHADOW_CASTER_MIN_RATIO);

    expect(skinned.castShadow).toBe(true);
    expect(instanced.castShadow).toBe(true);
    expect(stats.evaluated).toBe(0);
  });
});
