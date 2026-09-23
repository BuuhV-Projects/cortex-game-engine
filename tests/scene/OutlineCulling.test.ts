/**
 * Corte da casca de contorno por tamanho na tela (ADR-0251).
 *
 * Os dois modos de falha que estes testes existem para pegar são silenciosos:
 * cortar casca que o autor desligou de propósito (vidro vira painel preto) e
 * identificar a casca pela marca do OBJETO, que não sobrevive ao merge.
 */
import { describe, it, expect } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene, Vector3 } from 'three';

import { OUTLINE_THICKNESS_KEY } from '../../src/scene/Materials.js';
import {
  cullOutlines,
  isOutlineShell,
  shouldDrawOutline,
  OUTLINE_AUTHORED_KEY,
} from '../../src/scene/OutlineCulling.js';

/** Malha com material marcado como casca, do jeito que o `addOutline` marca. */
function shell(visible = true): Mesh {
  const material = new MeshBasicMaterial({ color: 0x000000 });
  material.userData[OUTLINE_THICKNESS_KEY] = 0.008;
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.visible = visible;
  return mesh;
}

/** Malha comum, sem a marca. */
function body(): Mesh {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
}

function sceneWith(...objects: Object3D[]): Scene {
  const scene = new Scene();
  for (const o of objects) scene.add(o);
  scene.updateMatrixWorld(true);
  return scene;
}

describe('shouldDrawOutline', () => {
  it('desenha quando a malha é grande na tela', () => {
    expect(shouldDrawOutline(1, 10, 0.025)).toBe(true);
  });

  it('esconde quando a malha fica pequena na tela', () => {
    expect(shouldDrawOutline(0.35, 100, 0.025)).toBe(false);
  });

  it('limiar 0 desliga o filtro', () => {
    expect(shouldDrawOutline(0.001, 10000, 0)).toBe(true);
  });

  it('é tamanho ANGULAR, não distância: raio grande sobrevive à mesma distância', () => {
    const distante = 200;
    expect(shouldDrawOutline(0.35, distante, 0.025)).toBe(false); // roda
    expect(shouldDrawOutline(20, distante, 0.025)).toBe(true); // prédio
  });
});

describe('isOutlineShell', () => {
  it('reconhece pela marca do MATERIAL', () => {
    expect(isOutlineShell(shell().material)).toBe(true);
    expect(isOutlineShell(body().material)).toBe(false);
  });

  it('sobrevive ao merge: a malha nova carrega o material antigo', () => {
    // É o que o mergeSubtree faz — `new Mesh(geo, sample.material)`. A marca do
    // OBJETO se perderia aqui; a do material é o que torna o filtro confiável.
    const original = shell();
    const fundida = new Mesh(new BoxGeometry(2, 2, 2), original.material);
    expect(fundida.userData['cortexOutline']).toBeUndefined();
    expect(isOutlineShell(fundida.material)).toBe(true);
  });

  it('não quebra com material ausente', () => {
    expect(isOutlineShell(null)).toBe(false);
    expect(isOutlineShell(undefined)).toBe(false);
  });
});

describe('cullOutlines', () => {
  it('esconde a casca distante e deixa o corpo em paz', () => {
    const casca = shell();
    casca.position.set(0, 0, -500);
    const corpo = body();
    corpo.position.set(0, 0, -500);
    const scene = sceneWith(casca, corpo);

    const stats = cullOutlines(scene, new Vector3(0, 0, 0), 0.025);

    expect(casca.visible).toBe(false);
    expect(corpo.visible).toBe(true); // o filtro não toca em quem não é casca
    expect(stats.culled).toBe(1);
  });

  it('mantém a casca próxima', () => {
    const casca = shell();
    casca.position.set(0, 0, -2);
    const scene = sceneWith(casca);
    cullOutlines(scene, new Vector3(0, 0, 0), 0.025);
    expect(casca.visible).toBe(true);
  });

  it('NUNCA liga casca que o autor desligou (vidro vira painel preto)', () => {
    const vidro = shell(false);
    vidro.position.set(0, 0, -1);
    const scene = sceneWith(vidro);

    cullOutlines(scene, new Vector3(0, 0, 0), 0.025);
    expect(vidro.visible).toBe(false);
    // Nem com o filtro desligado, que é quando ele "devolve a autoria".
    cullOutlines(scene, new Vector3(0, 0, 0), 0);
    expect(vidro.visible).toBe(false);
  });

  it('limiar 0 devolve a casca que o filtro havia escondido', () => {
    const casca = shell();
    casca.position.set(0, 0, -500);
    const scene = sceneWith(casca);

    cullOutlines(scene, new Vector3(0, 0, 0), 0.025);
    expect(casca.visible).toBe(false);
    cullOutlines(scene, new Vector3(0, 0, 0), 0);
    expect(casca.visible).toBe(true);
    expect(casca.userData[OUTLINE_AUTHORED_KEY]).toBe(true);
  });

  it('a autoria é lida na PRIMEIRA visita, antes de o filtro mexer', () => {
    const casca = shell();
    casca.position.set(0, 0, -500);
    const scene = sceneWith(casca);
    // Duas passadas seguidas não podem fazer o filtro "aprender" que a casca
    // é invisível e nunca mais devolvê-la.
    cullOutlines(scene, new Vector3(0, 0, 0), 0.025);
    cullOutlines(scene, new Vector3(0, 0, 0), 0.025);
    cullOutlines(scene, new Vector3(0, 0, 0), 0);
    expect(casca.visible).toBe(true);
  });
});
