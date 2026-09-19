/**
 * Winding do merge com malha ESPELHADA (SPEC-0214).
 *
 * Assar uma matriz de determinante negativo na geometria corrige as normais mas
 * vira a face: o backface culling a descarta e o objeto aparece PRETO no export
 * (só lá — o merge estático não roda no Studio). Estes testes medem a coerência
 * face a face, que é o que o olho vê.
 */
import { describe, it, expect } from 'vitest';
import {
  Scene,
  Object3D,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeStaticScene, mergeSubtree } from '../../src/scene/StaticMerge.js';

/**
 * Quantos triângulos têm a normal do ATRIBUTO apontando para o lado oposto ao
 * da normal geométrica (a que vem da ordem dos vértices). Zero = tudo coerente.
 */
function trianglesVirados(g: BufferGeometry): number {
  const pos = g.attributes['position']!;
  const nor = g.attributes['normal']!;
  const idx = g.index;
  const total = idx ? idx.count : pos.count;
  const at = (i: number): number => (idx ? idx.getX(i) : i);
  let virados = 0;
  for (let t = 0; t < total; t += 3) {
    const a = at(t), b = at(t + 1), c = at(t + 2);
    const pa = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
    const pb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
    const pc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
    const geometrica = new Vector3()
      .subVectors(pc, pb)
      .cross(new Vector3().subVectors(pa, pb))
      .normalize();
    const atributo = new Vector3(nor.getX(a), nor.getY(a), nor.getZ(a)).normalize();
    if (geometrica.dot(atributo) < 0) virados++;
  }
  return virados;
}

/** A malha que sobrou depois do merge (a fundida). */
function fundida(root: Object3D): Mesh {
  const malhas: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh) malhas.push(o as Mesh); });
  expect(malhas).toHaveLength(1);
  return malhas[0]!;
}

function caixa(material: MeshStandardMaterial, x: number): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), material);
  m.position.set(x, 0, 0);
  return m;
}

describe('mergeStaticScene com malha espelhada', () => {
  it('malha espelhada fundida sai com todas as faces coerentes', () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial({ color: 0x00ff00 });
    const normal = caixa(material, -3);
    const espelhada = caixa(material, 3);
    espelhada.scale.set(-1, 1, 1); // o caso do cenário: árvore duplicada e virada
    scene.add(normal, espelhada);
    scene.updateMatrixWorld(true);

    mergeStaticScene(scene);

    // Antes da SPEC-0214 aqui davam 12 virados — a metade espelhada inteira.
    expect(trianglesVirados(fundida(scene).geometry)).toBe(0);
  });

  it('não inverte quem já estava certo', () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    scene.add(caixa(material, -3), caixa(material, 3));
    scene.updateMatrixWorld(true);

    mergeStaticScene(scene);

    expect(trianglesVirados(fundida(scene).geometry)).toBe(0);
  });

  it('espelhamento em DOIS eixos não é invertido (determinante positivo)', () => {
    // Espelhar em x e y é uma ROTAÇÃO de 180°: o winding continua certo e
    // inverter aqui QUEBRARIA a malha.
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    const normal = caixa(material, -3);
    const girada = caixa(material, 3);
    girada.scale.set(-1, -1, 1);
    scene.add(normal, girada);
    scene.updateMatrixWorld(true);

    mergeStaticScene(scene);

    expect(trianglesVirados(fundida(scene).geometry)).toBe(0);
  });

  it('geometria NÃO indexada espelhada também sai coerente', () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    const a = new Mesh(new BoxGeometry(1, 1, 1).toNonIndexed(), material);
    a.position.set(-3, 0, 0);
    const b = new Mesh(new BoxGeometry(1, 1, 1).toNonIndexed(), material);
    b.position.set(3, 0, 0);
    b.scale.set(-1, 1, 1);
    scene.add(a, b);
    scene.updateMatrixWorld(true);

    mergeStaticScene(scene);

    const g = fundida(scene).geometry;
    expect(g.index).toBeNull();
    expect(trianglesVirados(g)).toBe(0);
  });
});

describe('mergeSubtree com malha espelhada', () => {
  it('peça espelhada dentro do modelo sai com as faces coerentes', () => {
    const carro = new Object3D();
    const material = new MeshStandardMaterial();
    const esquerdo = caixa(material, -1);
    const direito = caixa(material, 1);
    direito.scale.set(-1, 1, 1); // retrovisor espelhado — o caso real do .glb
    carro.add(esquerdo, direito);
    carro.updateMatrixWorld(true);

    mergeSubtree(carro);

    expect(trianglesVirados(fundida(carro).geometry)).toBe(0);
  });

  it('raiz espelhada não vira as peças (o bake é relativo à raiz)', () => {
    // A escala negativa da RAIZ se cancela no `inverse(root) * mesh`: o local
    // fica com determinante positivo e nada deve ser invertido.
    const carro = new Object3D();
    carro.scale.set(-1, 1, 1);
    const material = new MeshStandardMaterial();
    carro.add(caixa(material, -1), caixa(material, 1));
    carro.updateMatrixWorld(true);

    mergeSubtree(carro);

    expect(trianglesVirados(fundida(carro).geometry)).toBe(0);
  });
});
