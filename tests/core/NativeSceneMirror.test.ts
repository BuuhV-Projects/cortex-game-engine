import { describe, it, expect, afterEach } from 'vitest';
import {
  BoxGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Texture,
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
const CAMPO_MATERIAL_VISIVEL = 19;

/** Layout de sincronização — tem de acompanhar `scene_mirror.h`. */
const SYNC_FLOATS_POR_NO = 12;
/** Slot das flags do frame; é um campo de bits, não um booleano. */
const SYNC_FLAGS = 11;
/** Bits de `SYNC_FLAGS` — espelham `SyncFlag` em `scene_mirror.h`. */
const SYNC_VISIVEL = 1;
const SYNC_MATERIAL_VISIVEL = 2;

/** Bits de `flags` — espelham `NodeFlag` em `scene_mirror.h`. */
const FLAG_CAST_SHADOW = 1;
const FLAG_SKIP_ANGULAR_CULL = 2;
const FLAG_FRUSTUM_CULLED = 4;
const FLAG_DRAWABLE = 8;
const FLAG_SKINNED = 16;
const FLAG_INSTANCED = 32;
const FLAG_MATERIAL_ARRAY = 64;
const FLAG_ALPHA_CLIP = 128;
const FLAG_POSITION_NODE = 256;

/** Saída do gate: um slot por motivo, mais recusados e total. */
const GATE_MOTIVOS = 9;
const GATE_OUT_FLOATS = GATE_MOTIVOS + 2;

/** Ponte falsa com a forma da do host, para exercitar o lado JS sem o C++. */
function instalarPonteFalsa(nodeCapacity: number) {
  const matrices = new Float32Array(nodeCapacity * 16);
  const sync = new Float32Array(nodeCapacity * SYNC_FLOATS_POR_NO);
  const chamadas = {
    build: 0,
    update: 0,
    ultimoChanged: 0,
    shadowCasters: 0,
    shadowPassGate: 0,
    ultimaDescricao: new Float32Array(0),
    ultimosNosDaCena: 0,
    ultimoVsm: false,
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
    // Responde como o C++ responderia a uma cena com dois casters, um deles
    // recusado por geometria ausente: motivo 8, um objeto.
    shadowPassGate: (
      _minRatio: number,
      _x: number,
      _y: number,
      _z: number,
      _planos: Float32Array,
      nosDaCena: number,
      vsm: boolean,
      saida: Float64Array,
    ) => {
      chamadas.shadowPassGate++;
      chamadas.ultimosNosDaCena = nosDaCena;
      chamadas.ultimoVsm = vsm;
      saida.fill(0);
      saida[8] = 1; // geometria-ausente
      saida[GATE_MOTIVOS] = 1; // recusados
      saida[GATE_MOTIVOS + 1] = 2; // casters
      return 8;
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

  it('marca como desenhável a malha com geometria, sem olhar o material', () => {
    // `material.visible` SAIU deste bit no E1: ele muda por frame e agora viaja
    // no buffer de sincronização. O que fica aqui é só o que não muda — um
    // `Group` nunca vira malha. O estado inicial do material vai num campo
    // próprio do `build`, porque o primeiro frame enumera antes do `update`.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D(); // 0: Group — não desenha
    const visivel = malha(); // 1: desenha
    const semMaterial = malha(); // 2: malha, com o material desligado
    (semMaterial.material as { visible: boolean }).visible = false;
    raiz.add(visivel, semMaterial);

    new NativeSceneMirror().install(raiz);

    const d = chamadas.ultimaDescricao;
    const flag = (i: number) => d[FLOATS_POR_NO * i + CAMPO_FLAGS]! & FLAG_DRAWABLE;
    expect(flag(0)).toBe(0);
    expect(flag(1)).toBe(FLAG_DRAWABLE);
    expect(flag(2)).toBe(FLAG_DRAWABLE);
    expect(d[FLOATS_POR_NO + CAMPO_MATERIAL_VISIVEL]).toBe(1);
    expect(d[FLOATS_POR_NO * 2 + CAMPO_MATERIAL_VISIVEL]).toBe(0);
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
    expect(sync[SYNC_FLOATS_POR_NO + SYNC_FLAGS]! & SYNC_VISIVEL).toBe(SYNC_VISIVEL);

    filho.visible = false;
    espelho.update(new PerspectiveCamera());
    expect(sync[SYNC_FLOATS_POR_NO + SYNC_FLAGS]! & SYNC_VISIVEL).toBe(0);
  });

  it('manda o material.visible por FRAME, no mesmo slot do visible', () => {
    // E1 do passo 2 (SPEC-0245). Era o mesmo erro do `visible`: fotografado no
    // `build` e nunca mais olhado, enquanto o `three` o reavalia em TODA
    // travessia. Depois que o passe nativo assumir, isso seria sombra de um
    // objeto que não está na imagem.
    const { sync } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = malha();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());
    expect(sync[SYNC_FLOATS_POR_NO + SYNC_FLAGS]! & SYNC_MATERIAL_VISIVEL).toBe(
      SYNC_MATERIAL_VISIVEL,
    );

    (filho.material as { visible: boolean }).visible = false;
    espelho.update(new PerspectiveCamera());
    // O objeto continua visível: as duas coisas escondem coisas diferentes e
    // não podem ser confundidas uma com a outra.
    const flags = sync[SYNC_FLOATS_POR_NO + SYNC_FLAGS]!;
    expect(flags & SYNC_MATERIAL_VISIVEL).toBe(0);
    expect(flags & SYNC_VISIVEL).toBe(SYNC_VISIVEL);
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

  it('marca no build cada motivo de recusa que só o JS enxerga', () => {
    // O gate roda em C++, mas quem vê o MATERIAL é o JS. Se um destes bits não
    // subir, o gate aceita um caster que não sabe desenhar — a falha na direção
    // errada: sombra errada na imagem em vez de milissegundos não ganhos.
    const { chamadas } = instalarPonteFalsa(16);
    const raiz = new Object3D();

    const skinada = malha() as Mesh & { isSkinnedMesh: boolean };
    skinada.isSkinnedMesh = true;
    const instanciada = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 4);
    const emArray = new Mesh(new BoxGeometry(1, 1, 1), [
      new MeshBasicMaterial(),
      new MeshBasicMaterial(),
    ]);
    const comAlphaTest = malha();
    (comAlphaTest.material as { alphaTest: number }).alphaTest = 0.5;
    const comAlphaMap = malha();
    (comAlphaMap.material as { alphaMap: Texture }).alphaMap = new Texture();
    const comPositionNode = malha();
    (comPositionNode.material as unknown as { positionNode: unknown }).positionNode = {};
    const comum = malha();
    raiz.add(skinada, instanciada, emArray, comAlphaTest, comAlphaMap, comPositionNode, comum);

    new NativeSceneMirror().install(raiz);
    const flags = (i: number) => chamadas.ultimaDescricao[FLOATS_POR_NO * i + CAMPO_FLAGS]!;

    expect(flags(1) & FLAG_SKINNED).toBe(FLAG_SKINNED);
    expect(flags(2) & FLAG_INSTANCED).toBe(FLAG_INSTANCED);
    expect(flags(3) & FLAG_MATERIAL_ARRAY).toBe(FLAG_MATERIAL_ARRAY);
    expect(flags(4) & FLAG_ALPHA_CLIP).toBe(FLAG_ALPHA_CLIP);
    expect(flags(5) & FLAG_ALPHA_CLIP).toBe(FLAG_ALPHA_CLIP);
    expect(flags(6) & FLAG_POSITION_NODE).toBe(FLAG_POSITION_NODE);
    // E a malha comum não carrega nenhum motivo de recusa.
    const motivos =
      FLAG_SKINNED | FLAG_INSTANCED | FLAG_MATERIAL_ARRAY | FLAG_ALPHA_CLIP | FLAG_POSITION_NODE;
    expect(flags(7) & motivos).toBe(0);
  });

  it('traduz o veredito do gate com motivo, contagem e casters', () => {
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.add(malha());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    const veredito = espelho.shadowPassGate(
      new OrthographicCamera(-50, 50, 50, -50, 1, 200),
      new Vector3(1, 2, 3),
      0.15,
      977,
      false,
    );

    expect(chamadas.shadowPassGate).toBe(1);
    expect(chamadas.ultimosNosDaCena).toBe(977);
    expect(chamadas.ultimoVsm).toBe(false);
    expect(veredito?.accepted).toBe(false);
    expect(veredito?.reason).toBe('geometria-ausente');
    expect(veredito?.offenders).toBe(1);
    expect(veredito?.refusedCasters).toBe(1);
    expect(veredito?.totalCasters).toBe(2);
    expect(veredito?.counts['geometria-ausente']).toBe(1);
    expect(veredito?.counts['skinned']).toBe(0);
  });

  it('repassa o tipo de shadow map e a contagem de nós ao gate', () => {
    // Os dois fatos que só o JS enxerga: com VSM a RT de cor importa, e a
    // divergência de nós vira sombra faltando quando o passe nativo assumir.
    const { chamadas } = instalarPonteFalsa(8);
    const espelho = new NativeSceneMirror();
    espelho.install(new Object3D());

    espelho.shadowPassGate(new OrthographicCamera(), new Vector3(), 0.15, -1, true);

    expect(chamadas.ultimoVsm).toBe(true);
    expect(chamadas.ultimosNosDaCena).toBe(-1);
  });

  it('não dá veredito quando o host não tem o gate', () => {
    // Host antigo: o gate ausente NÃO pode virar um "aceito" por omissão.
    instalarPonteFalsa(8);
    delete (globalThis as Record<string, Record<string, unknown>>)['__cortexSceneMirror']![
      'shadowPassGate'
    ];
    const espelho = new NativeSceneMirror();
    espelho.install(new Object3D());

    expect(
      espelho.shadowPassGate(new OrthographicCamera(), new Vector3(), 0.15, 10, false),
    ).toBeUndefined();
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
