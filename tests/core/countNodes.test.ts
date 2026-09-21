import { describe, it, expect } from 'vitest';
import { Object3D } from 'three';
import { countNodes, censusBySceneNode } from '../../src/core/PerfTrace.js';

describe('countNodes', () => {
  it('conta a árvore inteira e, à parte, só o que é visível', () => {
    const raiz = new Object3D();
    const visivel = new Object3D();
    const escondido = new Object3D();
    escondido.visible = false;
    // Filho `visible: true` dentro de pai escondido NÃO desenha — mas o
    // `updateMatrixWorld` desce nele do mesmo jeito, então entra no total.
    escondido.add(new Object3D());
    visivel.add(new Object3D());
    raiz.add(visivel, escondido);

    expect(countNodes(raiz)).toEqual({ total: 5, visible: 3 });
  });

  it('conta a raiz sozinha', () => {
    expect(countNodes(new Object3D())).toEqual({ total: 1, visible: 1 });
  });

  it('agrupa o censo por nó de cena e ordena pelos maiores', () => {
    const raiz = new Object3D();
    const carro = new Object3D();
    carro.name = 'carro';
    carro.userData['cortexSceneNode'] = true;
    for (let i = 0; i < 4; i++) carro.add(new Object3D());
    const pedra = new Object3D();
    pedra.name = 'pedra';
    pedra.userData['cortexSceneNode'] = true;
    raiz.add(carro, pedra);

    const censo = censusBySceneNode(raiz, 10);
    // O carro leva a si e aos 4 filhos; a pedra, só a si.
    expect(censo[0]).toEqual(['carro', 5]);
    expect(censo).toContainEqual(['pedra', 1]);
  });
});
