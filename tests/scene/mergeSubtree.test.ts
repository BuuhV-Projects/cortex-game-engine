/**
 * Fusão de malhas DENTRO de um modelo (SPEC-0213): junta as peças paradas de um
 * objeto que SE MOVE — o oposto do merge estático de cena.
 *
 * O que estes testes protegem: o bake em espaço LOCAL (errar isso faz o objeto
 * sair voando ao primeiro movimento), o `preserve` (o que gira tem que
 * continuar girando) e as exclusões (nada pode sumir da tela).
 */
import { describe, it, expect } from 'vitest';
import {
  Object3D,
  Mesh,
  SkinnedMesh,
  BoxGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three';
import { mergeSubtree } from '../../src/scene/StaticMerge.js';

/** Malha simples com geometria própria (o merge consome a geometria). */
function peca(material: Material = new MeshBasicMaterial({ color: 0x224466 })): Mesh {
  return new Mesh(new BoxGeometry(1, 1, 1), material);
}

/** Conta as malhas de uma subárvore. */
function malhas(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); });
  return out;
}

/** Soma de triângulos da subárvore (índice quando há, senão posições). */
function triangulos(root: Object3D): number {
  return malhas(root).reduce((total, m) => {
    const g = m.geometry;
    return total + (g.index ? g.index.count : g.attributes['position']!.count) / 3;
  }, 0);
}

describe('mergeSubtree', () => {
  it('funde malhas de mesmo material numa só, preservando os triângulos', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial({ color: 0xff0000 });
    carro.add(peca(material), peca(material), peca(material));
    const trisAntes = triangulos(carro);

    const stats = mergeSubtree(carro);

    expect(stats).toEqual({ merged: 3, groups: 1, kept: 0 });
    expect(malhas(carro)).toHaveLength(1);
    expect(triangulos(carro)).toBe(trisAntes);
  });

  it('materiais diferentes não se misturam — um draw cada', () => {
    const carro = new Object3D();
    const pintura = new MeshBasicMaterial({ color: 0xff0000 });
    const vidro = new MeshBasicMaterial({ color: 0x111111 });
    carro.add(peca(pintura), peca(pintura), peca(vidro), peca(vidro));

    const stats = mergeSubtree(carro);

    expect(stats.groups).toBe(2);
    expect(malhas(carro)).toHaveLength(2);
  });

  it('funde peças aninhadas em qualquer profundidade', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial();
    const porta = new Object3D();
    const macaneta = new Object3D();
    macaneta.add(peca(material));
    porta.add(peca(material), macaneta);
    carro.add(peca(material), porta);

    const stats = mergeSubtree(carro);

    expect(stats.merged).toBe(3);
    expect(malhas(carro)).toHaveLength(1);
  });

  it('`preserve` mantém a subárvore inteira fora da fusão', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial();
    const roda = new Object3D();
    roda.name = 'FL';
    const pneu = peca(material);
    const aro = peca(material);
    roda.add(pneu, aro);
    carro.add(peca(material), peca(material), roda);

    const stats = mergeSubtree(carro, { preserve: [roda] });

    // O corpo fundiu; a roda seguiu intacta, com as duas peças e o mesmo pai.
    expect(stats.merged).toBe(2);
    expect(roda.children).toHaveLength(2);
    expect(pneu.parent).toBe(roda);
    expect(aro.parent).toBe(roda);
    expect(roda.parent).toBe(carro);
  });

  it('o bake é em espaço LOCAL: mover a raiz depois leva a fusão junto', () => {
    const carro = new Object3D();
    carro.position.set(10, 0, 5);
    const material = new MeshBasicMaterial();
    const a = peca(material);
    a.position.set(1, 0, 0);
    const b = peca(material);
    b.position.set(-1, 0, 0);
    carro.add(a, b);

    mergeSubtree(carro);
    const fundida = malhas(carro)[0]!;

    // Em LOCAL, os vértices vão de -1.5 a 1.5 em X (dois cubos de lado 1 nas
    // posições ±1). Se o bake fosse em mundo, teriam somado o +10 da raiz.
    fundida.geometry.computeBoundingBox();
    const box = fundida.geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-1.5);
    expect(box.max.x).toBeCloseTo(1.5);

    // E o objeto segue a raiz: o mundo continua batendo depois de mover.
    carro.position.set(-20, 3, 0);
    carro.updateMatrixWorld(true);
    const centro = fundida.getWorldPosition(new Vector3());
    expect(centro.x).toBeCloseTo(-20);
    expect(centro.y).toBeCloseTo(3);
  });

  it('o bake respeita a transformação de cada peça', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial();
    const base = peca(material);
    const alta = peca(material);
    alta.position.set(0, 4, 0);
    carro.add(base, alta);

    mergeSubtree(carro);

    const fundida = malhas(carro)[0]!;
    fundida.geometry.computeBoundingBox();
    // A peça alta ficou em cima (4 + meio cubo), não colapsada na origem.
    expect(fundida.geometry.boundingBox!.max.y).toBeCloseTo(4.5);
    expect(fundida.geometry.boundingBox!.min.y).toBeCloseTo(-0.5);
  });

  it('grupo de uma malha só não é fundido (não vale a cópia)', () => {
    const carro = new Object3D();
    const unica = peca();
    carro.add(unica);

    const stats = mergeSubtree(carro);

    expect(stats).toEqual({ merged: 0, groups: 0, kept: 1 });
    expect(malhas(carro)[0]).toBe(unica); // a MESMA malha, intocada
  });

  it('malha com esqueleto e multi-material ficam como estavam', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial();
    const skinada = new SkinnedMesh(new BoxGeometry(1, 1, 1), material);
    const multi = new Mesh(new BoxGeometry(1, 1, 1), [material, new MeshBasicMaterial()]);
    carro.add(skinada, multi, peca(material), peca(material));

    const stats = mergeSubtree(carro);

    expect(stats.merged).toBe(2); // só as duas peças comuns
    expect(stats.kept).toBe(2);
    expect(skinada.parent).toBe(carro);
    expect(multi.parent).toBe(carro);
  });

  it('separa por sombra: o que projeta não entra no grupo do que não projeta', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial();
    const comSombra = peca(material);
    comSombra.castShadow = true;
    const outraComSombra = peca(material);
    outraComSombra.castShadow = true;
    carro.add(comSombra, outraComSombra, peca(material), peca(material));

    const stats = mergeSubtree(carro);

    expect(stats.groups).toBe(2);
    const fundidas = malhas(carro);
    expect(fundidas.filter((m) => m.castShadow)).toHaveLength(1);
  });

  it('`cortexOrigMaterial` separa grupos e sobrevive à fusão', () => {
    const carro = new Object3D();
    // Mesmo preset aplicado por cima, origens diferentes (SPEC-0196): o jogo
    // ainda precisa distinguir a pintura do resto depois do merge.
    const preset = new MeshStandardMaterial({ color: 0xffffff });
    const origemPintura = new MeshStandardMaterial({ color: 0xff0000 });
    const origemPlastico = new MeshStandardMaterial({ color: 0x222222 });

    const pintadas = [peca(preset), peca(preset)];
    for (const m of pintadas) m.userData['cortexOrigMaterial'] = origemPintura;
    const plasticas = [peca(preset), peca(preset)];
    for (const m of plasticas) m.userData['cortexOrigMaterial'] = origemPlastico;
    carro.add(...pintadas, ...plasticas);

    const stats = mergeSubtree(carro);

    expect(stats.groups).toBe(2);
    const origens = malhas(carro).map((m) => m.userData['cortexOrigMaterial']);
    expect(origens).toContain(origemPintura);
    expect(origens).toContain(origemPlastico);
  });

  it('nomeia as malhas geradas para diagnóstico', () => {
    const carro = new Object3D();
    const material = new MeshBasicMaterial();
    carro.add(peca(material), peca(material));

    mergeSubtree(carro, { name: 'car-body' });

    expect(malhas(carro)[0]!.name).toBe('car-body-0');
  });
});
