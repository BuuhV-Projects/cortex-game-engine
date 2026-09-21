import { describe, it, expect, afterEach } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three';
import { NativeSceneMirror, nativeSceneMirrorAvailable } from '../../src/core/NativeSceneMirror.js';

/** Ponte falsa com a forma da do host, para exercitar o lado JS sem o C++. */
function instalarPonteFalsa(nodeCapacity: number) {
  const matrices = new Float32Array(nodeCapacity * 16);
  const sync = new Float32Array(nodeCapacity * 11);
  const chamadas = { build: 0, update: 0, ultimoChanged: 0 };
  (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
    build: (descricao: Float32Array) => {
      chamadas.build++;
      // Espelha o contrato do C++: recusa pai depois do filho.
      for (let i = 0; i < descricao.length / 14; i++) {
        if (descricao[i * 14]! >= i) return false;
      }
      return true;
    },
    worldMatrices: () => matrices,
    syncBuffer: () => sync,
    update: (changed: number) => {
      chamadas.update++;
      chamadas.ultimoChanged = changed;
      return changed;
    },
  };
  return { matrices, sync, chamadas };
}

describe('NativeSceneMirror', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  it('é inerte quando o host não expõe a ponte (browser, Studio)', () => {
    expect(nativeSceneMirrorAvailable()).toBe(false);
    const espelho = new NativeSceneMirror();
    expect(espelho.install(new Object3D())).toBe(false);
    expect(espelho.installed).toBe(false);
  });

  it('espelha a árvore com pai antes de filho', () => {
    const { chamadas } = instalarPonteFalsa(16);
    const raiz = new Object3D();
    const filho = new Object3D();
    const neto = new Object3D();
    filho.add(neto);
    raiz.add(filho);

    const espelho = new NativeSceneMirror();
    expect(espelho.install(raiz)).toBe(true);
    expect(chamadas.build).toBe(1);
    expect(espelho.nodeCount).toBe(3);
  });

  it('aponta o matrixWorld do objeto para a memória nativa, sem cópia', () => {
    // É o ponto do desenho: o C++ escreve, o three lê, e não há laço por frame.
    const { matrices } = instalarPonteFalsa(4);
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    matrices[12] = 42;
    expect(raiz.matrixWorld.elements[12]).toBe(42);
    expect(raiz.matrixWorldAutoUpdate).toBe(false);
  });

  it('manda uma chamada por frame, não uma por objeto', () => {
    // Se isto virar uma chamada por objeto, volta o custo de 15 us por travessia
    // que derrubou a hipótese da SPEC-0225.
    const { chamadas } = instalarPonteFalsa(16);
    const raiz = new Object3D();
    raiz.add(new Object3D(), new Object3D());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());

    expect(chamadas.update).toBe(1);
    expect(chamadas.ultimoChanged).toBe(3);
  });

  it('escreve o transform local no buffer de sincronização', () => {
    const { sync } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = new Object3D();
    filho.position.set(7, 8, 9);
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());

    // Segundo nó (índice 1): idx, px, py, pz…
    expect(sync[11]).toBe(1);
    expect(sync[12]).toBe(7);
    expect(sync[13]).toBe(8);
    expect(sync[14]).toBe(9);
  });
});
