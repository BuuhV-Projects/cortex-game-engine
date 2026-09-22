import { describe, it, expect, afterEach } from 'vitest';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { NativeSceneMirror, nativeSceneMirrorAvailable } from '../../src/core/NativeSceneMirror.js';
import { SHADOW_AUTHORED_KEY } from '../../src/scene/ShadowCasterCulling.js';

/** Layout de construção — tem de acompanhar `scene_mirror_shim.cpp`. */
const FLOATS_POR_NO = 20;
const CAMPO_VISIVEL = 12;
const CAMPO_FLAGS = 13;
const CAMPO_GEOMETRIA = 14;
const CAMPO_CENTRO = 15;
const CAMPO_RAIO = 18;

/** Layout de sincronização — tem de acompanhar `scene_mirror.h`. */
const SYNC_FLOATS_POR_NO = 12;
const SYNC_VISIVEL = 11;

/** Bits de `flags` — espelham `NodeFlag` em `scene_mirror.h`. */
const FLAG_CAST_SHADOW = 1;
const FLAG_SKIP_ANGULAR_CULL = 2;
const FLAG_FRUSTUM_CULLED = 4;
const FLAG_DRAWABLE = 8;

/** Ponte falsa com a forma da do host, para exercitar o lado JS sem o C++. */
function instalarPonteFalsa(nodeCapacity: number) {
  const matrices = new Float32Array(nodeCapacity * 16);
  const sync = new Float32Array(nodeCapacity * SYNC_FLOATS_POR_NO);
  const chamadas = {
    build: 0,
    update: 0,
    ultimoChanged: 0,
    shadowCasters: 0,
    ultimaDescricao: new Float32Array(0),
    ultimoMinRatio: 0,
    ultimaCamera: [0, 0, 0] as [number, number, number],
    ultimosPlanos: new Float32Array(0),
  };
  (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
    build: (descricao: Float32Array) => {
      chamadas.build++;
      chamadas.ultimaDescricao = descricao;
      // Espelha o contrato do C++: recusa pai depois do filho.
      for (let i = 0; i < descricao.length / FLOATS_POR_NO; i++) {
        if (descricao[i * FLOATS_POR_NO]! >= i) return false;
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
    shadowCasters: (
      minRatio: number,
      x: number,
      y: number,
      z: number,
      planos: Float32Array,
    ) => {
      chamadas.shadowCasters++;
      chamadas.ultimoMinRatio = minRatio;
      chamadas.ultimaCamera = [x, y, z];
      chamadas.ultimosPlanos = planos.slice();
      return 42;
    },
  };
  return { matrices, sync, chamadas };
}

/** Malha simples, com bounding sphere já calculável. */
function malha(): Mesh {
  return new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
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
    expect(sync[SYNC_FLOATS_POR_NO]).toBe(1);
    expect(sync[SYNC_FLOATS_POR_NO + 1]).toBe(7);
    expect(sync[SYNC_FLOATS_POR_NO + 2]).toBe(8);
    expect(sync[SYNC_FLOATS_POR_NO + 3]).toBe(9);
  });

  it('manda ao C++ o castShadow AUTORADO, não o que o filtro deixou no frame', () => {
    // O culling angular da SPEC-0197 mexe no `castShadow` a cada 10 frames e
    // memoriza a autoria no `userData`. Quem reaplica a regra é o C++, então
    // mandar o valor já filtrado faria o filtro rodar duas vezes e a contagem
    // encolher sozinha a cada passada.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filtrada = malha();
    filtrada.castShadow = false; // como o filtro a deixou
    filtrada.userData[SHADOW_AUTHORED_KEY] = true; // como o autor a deixou
    const desligadaPeloAutor = malha();
    desligadaPeloAutor.castShadow = false;
    raiz.add(filtrada, desligadaPeloAutor);

    new NativeSceneMirror().install(raiz);

    const flagsFiltrada = chamadas.ultimaDescricao[FLOATS_POR_NO + CAMPO_FLAGS]!;
    const flagsDesligada = chamadas.ultimaDescricao[FLOATS_POR_NO * 2 + CAMPO_FLAGS]!;
    expect(flagsFiltrada & FLAG_CAST_SHADOW).toBe(FLAG_CAST_SHADOW);
    expect(flagsDesligada & FLAG_CAST_SHADOW).toBe(0);
  });

  it('marca como desenhável só a malha com geometria e material visível', () => {
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D(); // 0: Group — não desenha
    const visivel = malha(); // 1: desenha
    const semMaterial = malha(); // 2: material invisível
    (semMaterial.material as { visible: boolean }).visible = false;
    raiz.add(visivel, semMaterial);

    new NativeSceneMirror().install(raiz);

    const flag = (i: number) => chamadas.ultimaDescricao[FLOATS_POR_NO * i + CAMPO_FLAGS]! & FLAG_DRAWABLE;
    expect(flag(0)).toBe(0);
    expect(flag(1)).toBe(FLAG_DRAWABLE);
    expect(flag(2)).toBe(0);
  });

  it('manda a esfera da geometria em espaço local e um id estável por geometria', () => {
    // O id é o vínculo com o `GeometryRegistry`: duas malhas que compartilham a
    // geometria (as rodas de um carro) têm de receber o MESMO id, senão a
    // tabela do passo 2 guarda a mesma malha várias vezes.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const geometria = new BoxGeometry(2, 2, 2);
    const uma = new Mesh(geometria, new MeshBasicMaterial());
    const outra = new Mesh(geometria, new MeshBasicMaterial());
    raiz.add(uma, outra);

    new NativeSceneMirror().install(raiz);

    const d = chamadas.ultimaDescricao;
    expect(d[FLOATS_POR_NO + CAMPO_GEOMETRIA]).toBe(d[FLOATS_POR_NO * 2 + CAMPO_GEOMETRIA]);
    expect(d[FLOATS_POR_NO + CAMPO_GEOMETRIA]).toBeGreaterThanOrEqual(0);
    expect(d[CAMPO_GEOMETRIA]).toBe(-1); // o Group não tem geometria
    // Cubo 2×2×2 centrado na origem: raio = metade da diagonal = √3.
    expect(d[FLOATS_POR_NO + CAMPO_RAIO]).toBeCloseTo(Math.sqrt(3), 5);
    expect(d[FLOATS_POR_NO + CAMPO_CENTRO]).toBeCloseTo(0, 5);
  });

  it('isenta skinned/instanced do filtro angular e respeita frustumCulled', () => {
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const comum = malha();
    const semCorte = malha();
    semCorte.frustumCulled = false;
    const fingeSkin = malha() as Mesh & { isSkinnedMesh: boolean };
    fingeSkin.isSkinnedMesh = true;
    raiz.add(comum, semCorte, fingeSkin);

    new NativeSceneMirror().install(raiz);

    const flags = (i: number) => chamadas.ultimaDescricao[FLOATS_POR_NO * i + CAMPO_FLAGS]!;
    expect(flags(1) & FLAG_FRUSTUM_CULLED).toBe(FLAG_FRUSTUM_CULLED);
    expect(flags(1) & FLAG_SKIP_ANGULAR_CULL).toBe(0);
    expect(flags(2) & FLAG_FRUSTUM_CULLED).toBe(0);
    expect(flags(3) & FLAG_SKIP_ANGULAR_CULL).toBe(FLAG_SKIP_ANGULAR_CULL);
  });

  it('espelha o visible próprio do nó, sem resolver a herança no JS', () => {
    // A herança é do C++ (uma passada linear, pai antes de filho). Resolver
    // aqui custaria um traverse por build e travaria o valor de um frame só.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.visible = false;
    const filho = malha();
    raiz.add(filho);

    new NativeSceneMirror().install(raiz);

    expect(chamadas.ultimaDescricao[CAMPO_VISIVEL]).toBe(0);
    expect(chamadas.ultimaDescricao[FLOATS_POR_NO + CAMPO_VISIVEL]).toBe(1);
  });

  it('manda o visible por FRAME, não só na construção', () => {
    // Era o buraco que fazia o C++ contar até 42 casters a mais que o `three`:
    // o `visible` só existia no `build`, então o que sumia em runtime seguia
    // projetando sombra do lado de lá para sempre.
    const { sync } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = malha();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());
    expect(sync[SYNC_FLOATS_POR_NO + SYNC_VISIVEL]).toBe(1);

    filho.visible = false;
    espelho.update(new PerspectiveCamera());
    expect(sync[SYNC_FLOATS_POR_NO + SYNC_VISIVEL]).toBe(0);
  });

  it('conta os casters no host com a câmera do jogo e a ortho da cascata', () => {
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.add(malha());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    const cascata = new OrthographicCamera(-50, 50, 50, -50, 1, 200);
    const total = espelho.countShadowCasters(cascata, new Vector3(1, 2, 3), 0.15);

    expect(total).toBe(42);
    expect(chamadas.shadowCasters).toBe(1);
    expect(chamadas.ultimoMinRatio).toBe(0.15);
    expect(chamadas.ultimaCamera).toEqual([1, 2, 3]);
    expect(chamadas.ultimosPlanos).toHaveLength(24);
  });

  it('não conta nada quando o host não tem o enumerador', () => {
    // Host antigo, sem o método: a contagem é diagnóstico e nunca pode quebrar
    // o frame por falta dele.
    instalarPonteFalsa(8);
    delete (globalThis as Record<string, Record<string, unknown>>)['__cortexSceneMirror']![
      'shadowCasters'
    ];
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    expect(
      espelho.countShadowCasters(new OrthographicCamera(), new Vector3(), 0.15),
    ).toBeUndefined();
  });
});
