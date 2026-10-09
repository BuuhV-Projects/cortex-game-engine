import { describe, it, expect, afterEach } from 'vitest';
import {
  BackSide,
  BoxGeometry,
  DoubleSide,
  FrontSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three';
import {
  NativeSceneMirror,
  nativeSceneMirrorAvailable,
  SWEEP_PERIOD_FRAMES,
  SWEEP_MIN_NODES,
} from '../../src/core/NativeSceneMirror.js';
import { SHADOW_AUTHORED_KEY } from '../../src/scene/ShadowCasterCulling.js';
import {
  NODE_MAIN_FRUSTUM_CULLED,
  NODE_MAIN_UNSUPPORTED,
  SYNC_FRUSTUM_CULLED,
  SYNC_MAIN_UNSUPPORTED,
  mainPassFrameFlags,
} from '../../src/render/MainPassKind.js';

/** Layout de construção — tem de acompanhar `scene_mirror_shim.cpp`. */
const FLOATS_POR_NO = 21;
const CAMPO_VISIVEL = 12;
const CAMPO_FLAGS = 13;
const CAMPO_GEOMETRIA = 14;
const CAMPO_CENTRO = 15;
const CAMPO_RAIO = 18;
const CAMPO_MATERIAL_VISIVEL = 19;
const CAMPO_LADO_DA_SOMBRA = 20;

/** Layout de sincronização — tem de acompanhar `scene_mirror.h`. */
const SYNC_FLOATS_POR_NO = 12;
/** Slot das flags do frame; é um campo de bits, não um booleano. */
const SYNC_FLAGS = 11;
/** Bits de `SYNC_FLAGS` — espelham `SyncFlag` em `scene_mirror.h`. */
const SYNC_VISIVEL = 1;
const SYNC_MATERIAL_VISIVEL = 2;
/** Deslocamento dos dois bits de lado da face (ver `kSyncShadowSideShift`). */
const SYNC_LADO_SHIFT = 2;
const SYNC_LADO_MASCARA = 0b11;

/** Valores de `ShadowSide` em `scene_mirror.h`. */
const LADO_BACK = 0;
const LADO_FRONT = 1;
const LADO_DOUBLE = 2;
const LADO_IRREPRODUZIVEL = 3;

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
const GATE_MOTIVOS = 10;
const GATE_OUT_FLOATS = GATE_MOTIVOS + 2;

/** Ponte falsa com a forma da do host, para exercitar o lado JS sem o C++. */
function instalarPonteFalsa(nodeCapacity: number) {
  const matrices = new Float32Array(nodeCapacity * 16);
  // `double`, como o do host: com float32 a paridade compararia arredondamento.
  const sync = new Float64Array(nodeCapacity * SYNC_FLOATS_POR_NO);
  /**
   * O estado que o C++ guarda por índice (SPEC-0322): transform local + flags
   * do quadro. Nasce da descrição (build/append) e muda SÓ pelas linhas do
   * `update`, como o `applyTransforms` — é o que torna linha faltando visível.
   */
  const host = new Map<number, number[]>();
  const removidos = new Set<number>();
  const semear = (descricao: Float32Array, indice: (i: number) => number) => {
    for (let i = 0; i < descricao.length / FLOATS_POR_NO; i++) {
      const b = i * FLOATS_POR_NO;
      const flags =
        (descricao[b + CAMPO_VISIVEL] ? SYNC_VISIVEL : 0) |
        (descricao[b + CAMPO_MATERIAL_VISIVEL] ? SYNC_MATERIAL_VISIVEL : 0) |
        (descricao[b + CAMPO_LADO_DA_SOMBRA]! << SYNC_LADO_SHIFT) |
        // Estado inicial do passe principal, como o `initialMainFrameFlags` do C++.
        (descricao[b + CAMPO_FLAGS]! & NODE_MAIN_FRUSTUM_CULLED ? SYNC_FRUSTUM_CULLED : 0) |
        (descricao[b + CAMPO_FLAGS]! & NODE_MAIN_UNSUPPORTED ? SYNC_MAIN_UNSUPPORTED : 0);
      host.set(indice(i), [...Array.from(descricao.subarray(b + 1, b + 11)), flags]);
    }
  };
  const chamadas = {
    build: 0,
    update: 0,
    ultimoChanged: 0,
    drawShadowPass: 0,
    appendNodes: 0,
    removeNode: 0,
    ultimoRemovido: -1,
    ultimaDescricaoAppend: new Float32Array(0),
    ultimaDescricao: new Float32Array(0),
    ultimosNosDaCena: 0,
    ultimoVsm: false,
    ultimoAlvo: null as unknown,
    ultimoViewProj: new Float64Array(0),
    /** O que o C++ devolve na próxima chamada: negativo recusa, positivo desenha. */
    proximaResposta: -8,
    ultimoMinRatio: 0,
    ultimaCamera: [0, 0, 0] as [number, number, number],
    ultimosPlanos: new Float32Array(0),
  };
  /** Próximo slot livre, como no C++: o append vai para o fim. */
  const estado = { proximo: 0 };
  (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
    build: (descricao: Float32Array) => {
      chamadas.build++;
      chamadas.ultimaDescricao = descricao;
      estado.proximo = descricao.length / FLOATS_POR_NO;
      // Espelha o contrato do C++: recusa pai depois do filho.
      for (let i = 0; i < descricao.length / FLOATS_POR_NO; i++) {
        if (descricao[i * FLOATS_POR_NO]! >= i) return false;
      }
      semear(descricao, (i) => i);
      return true;
    },
    worldMatrices: () => matrices,
    syncBuffer: () => sync,
    // Espelha o contrato do C++: o lote entra inteiro, no fim, e cada nó volta
    // com o índice dele. Estouro de capacidade devolve o código negativo em vez
    // de realocar (que é o `use-after-free` que a reserva existe para evitar).
    appendNodes: (descricao: Float32Array, saida: Int32Array) => {
      chamadas.appendNodes++;
      chamadas.ultimaDescricaoAppend = descricao.slice();
      const quantos = descricao.length / FLOATS_POR_NO;
      if (estado.proximo + quantos > nodeCapacity) return -1;
      for (let i = 0; i < quantos; i++) saida[i] = estado.proximo++;
      semear(descricao, (i) => saida[i]!);
      return quantos;
    },
    removeNode: (indice: number) => {
      chamadas.removeNode++;
      chamadas.ultimoRemovido = indice;
      removidos.add(indice);
      return 1;
    },
    update: (changed: number) => {
      chamadas.update++;
      chamadas.ultimoChanged = changed;
      for (let i = 0; i < changed; i++) {
        const b = i * SYNC_FLOATS_POR_NO;
        const indice = sync[b]!;
        if (removidos.has(indice)) continue; // lápide não ressuscita
        host.set(indice, Array.from(sync.subarray(b + 1, b + SYNC_FLOATS_POR_NO)));
      }
      return changed;
    },
    // Responde como o C++ responderia a uma cena com dois casters, um deles
    // recusado por geometria ausente: motivo 8, um objeto. O sinal do retorno
    // é o contrato: negativo = código de recusa, positivo = casters desenhados.
    drawShadowPass: (
      minRatio: number,
      x: number,
      y: number,
      z: number,
      planos: Float32Array,
      viewProjection: Float64Array,
      alvo: unknown,
      nosDaCena: number,
      vsm: boolean,
      saida: Float64Array,
    ) => {
      chamadas.drawShadowPass++;
      chamadas.ultimoMinRatio = minRatio;
      chamadas.ultimaCamera = [x, y, z];
      chamadas.ultimosPlanos = planos.slice();
      chamadas.ultimoViewProj = viewProjection.slice();
      chamadas.ultimoAlvo = alvo;
      chamadas.ultimosNosDaCena = nosDaCena;
      chamadas.ultimoVsm = vsm;
      saida.fill(0);
      saida[8] = 1; // geometria-ausente
      saida[GATE_MOTIVOS] = 1; // recusados
      saida[GATE_MOTIVOS + 1] = 2; // casters
      return chamadas.proximaResposta;
    },
      };
  return { matrices, sync, chamadas, host };
}

/** Flags do quadro que o host tem para o índice. */
function flagsNoHost(host: Map<number, number[]>, indice: number): number {
  return host.get(indice)![SYNC_FLAGS - 1]!;
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

  it('manda uma chamada por frame, e só as linhas de quem mudou', () => {
    // Se isto virar uma chamada por objeto, volta o custo de 15 us por travessia
    // que derrubou a hipótese da SPEC-0225. E se voltar a mandar todo nó, volta
    // o laço de 11 ms do DDD 61 (SPEC-0322).
    const { chamadas } = instalarPonteFalsa(16);
    const raiz = new Object3D();
    const mexe = new Object3D();
    raiz.add(mexe, new Object3D());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());
    expect(chamadas.update).toBe(1);
    expect(chamadas.ultimoChanged).toBe(0);
    expect(espelho.syncedNodes).toBe(0);

    mexe.position.x = 3;
    espelho.update(new PerspectiveCamera());
    expect(chamadas.update).toBe(2);
    expect(chamadas.ultimoChanged).toBe(1);
    expect(espelho.syncedNodes).toBe(1);
  });

  it('escreve o transform local no buffer de sincronização', () => {
    const { sync, host } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = new Object3D();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    filho.position.set(7, 8, 9);
    espelho.update(new PerspectiveCamera());

    // Única linha: idx, px, py, pz…
    expect(sync[0]).toBe(1);
    expect(sync.slice(1, 4)).toEqual(new Float64Array([7, 8, 9]));
    expect(host.get(1)!.slice(0, 3)).toEqual([7, 8, 9]);
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
    const { host } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = malha();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());
    expect(flagsNoHost(host, 1) & SYNC_VISIVEL).toBe(SYNC_VISIVEL);

    filho.visible = false;
    espelho.update(new PerspectiveCamera());
    expect(flagsNoHost(host, 1) & SYNC_VISIVEL).toBe(0);
  });

  it('manda o material.visible por FRAME, no mesmo slot do visible', () => {
    // E1 do passo 2 (SPEC-0245). Era o mesmo erro do `visible`: fotografado no
    // `build` e nunca mais olhado, enquanto o `three` o reavalia em TODA
    // travessia. Depois que o passe nativo assumir, isso seria sombra de um
    // objeto que não está na imagem.
    const { host } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = malha();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    espelho.update(new PerspectiveCamera());
    expect(flagsNoHost(host, 1) & SYNC_MATERIAL_VISIVEL).toBe(SYNC_MATERIAL_VISIVEL);

    (filho.material as { visible: boolean }).visible = false;
    espelho.update(new PerspectiveCamera());
    // O objeto continua visível: as duas coisas escondem coisas diferentes e
    // não podem ser confundidas uma com a outra.
    const flags = flagsNoHost(host, 1);
    expect(flags & SYNC_MATERIAL_VISIVEL).toBe(0);
    expect(flags & SYNC_VISIVEL).toBe(SYNC_VISIVEL);
  });

  it('manda o lado da face do passe de sombra pela tabela do three', () => {
    // A tabela `_shadowSide` (premissa 4 da SPEC-0246): o `three` desenha a
    // sombra com o lado INVERTIDO. Quem resolve a tabela é o JS — o C++ só
    // escolhe o `cullMode` — então um erro aqui vira sombra da face errada.
    const { chamadas } = instalarPonteFalsa(16);
    const raiz = new Object3D();
    const daFrente = malha();
    const deTras = malha();
    (deTras.material as { side: number }).side = BackSide;
    const dosDois = malha();
    (dosDois.material as { side: number }).side = DoubleSide;
    raiz.add(daFrente, deTras, dosDois);

    new NativeSceneMirror().install(raiz);

    const d = chamadas.ultimaDescricao;
    const lado = (i: number) => d[FLOATS_POR_NO * i + CAMPO_LADO_DA_SOMBRA];
    expect(lado(1)).toBe(LADO_BACK); // FrontSide -> BackSide
    expect(lado(2)).toBe(LADO_FRONT); // BackSide -> FrontSide
    expect(lado(3)).toBe(LADO_DOUBLE); // DoubleSide -> DoubleSide
    expect(lado(0)).toBe(LADO_BACK); // o Group não tem material: o valor comum
  });

  it('um shadowSide autorado vence a inversão', () => {
    // `overrideMaterial.side = material.shadowSide ?? _shadowSide[side]`: com o
    // `shadowSide` autorado o three usa o valor DIRETO, sem inverter.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const comAutoria = malha();
    (comAutoria.material as { side: number; shadowSide: number | null }).shadowSide = FrontSide;
    raiz.add(comAutoria);

    new NativeSceneMirror().install(raiz);

    expect(chamadas.ultimaDescricao[FLOATS_POR_NO + CAMPO_LADO_DA_SOMBRA]).toBe(LADO_FRONT);
  });

  it('lado desconhecido ou materiais que discordam viram RECUSA, não aproximação', () => {
    // O quarto valor existe para o gate recusar: desenhar com um `cullMode`
    // chutado daria sombra da face errada, que é artefato sem erro nenhum.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const foraDaTabela = malha();
    (foraDaTabela.material as { side: number }).side = 99;
    const discordando = new Mesh(new BoxGeometry(1, 1, 1), [
      new MeshBasicMaterial({ side: FrontSide }),
      new MeshBasicMaterial({ side: DoubleSide }),
    ]);
    raiz.add(foraDaTabela, discordando);

    new NativeSceneMirror().install(raiz);

    const d = chamadas.ultimaDescricao;
    expect(d[FLOATS_POR_NO + CAMPO_LADO_DA_SOMBRA]).toBe(LADO_IRREPRODUZIVEL);
    expect(d[FLOATS_POR_NO * 2 + CAMPO_LADO_DA_SOMBRA]).toBe(LADO_IRREPRODUZIVEL);
  });

  it('o lado da face viaja por FRAME, como o visible e o material.visible', () => {
    // O `three` reavalia `material.side` a cada travessia. Fotografá-lo no
    // `build` seria o terceiro erro do mesmo tipo nesta série — os dois
    // anteriores (`visible` e `material.visible`) viraram sombra errada.
    const { host } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const filho = malha();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    const ladoNoFrame = () => (flagsNoHost(host, 1) >> SYNC_LADO_SHIFT) & SYNC_LADO_MASCARA;

    espelho.update(new PerspectiveCamera());
    expect(ladoNoFrame()).toBe(LADO_BACK);

    (filho.material as { side: number }).side = DoubleSide;
    espelho.update(new PerspectiveCamera());
    expect(ladoNoFrame()).toBe(LADO_DOUBLE);
    // E os bits do lado não contaminam os vizinhos do mesmo campo.
    expect(flagsNoHost(host, 1) & SYNC_VISIVEL).toBe(SYNC_VISIVEL);

    // Não é caminho só de ida.
    (filho.material as { side: number }).side = FrontSide;
    espelho.update(new PerspectiveCamera());
    expect(ladoNoFrame()).toBe(LADO_BACK);
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

  it('leva à ponte a cascata, a câmera do filtro e o alvo do passe de sombra', () => {
    // Tudo que o C++ precisa para desenhar o shadow map vai numa chamada só, e
    // cada item aqui já quebrou a imagem uma vez: os planos são os da ORTHO da
    // cascata (não os da câmera do jogo), a posição é a do filtro angular, e a
    // `viewProj` atravessa em `Float64Array` — degradar para `float32` é o
    // caminho conhecido para as bandas da SPEC-0234.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.add(malha());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    const viewProj = new Float64Array(16).fill(0.5);
    const alvo = { textura: 'ShadowDepthTexture' };
    chamadas.proximaResposta = 66;
    const saida = espelho.drawShadowPass(
      new OrthographicCamera(-50, 50, 50, -50, 1, 200),
      new Vector3(1, 2, 3),
      0.15,
      viewProj,
      alvo,
      -1,
      false,
    );

    expect(chamadas.drawShadowPass).toBe(1);
    expect(chamadas.ultimoMinRatio).toBe(0.15);
    expect(chamadas.ultimaCamera).toEqual([1, 2, 3]);
    expect(chamadas.ultimosPlanos).toHaveLength(24);
    expect(chamadas.ultimoViewProj).toBeInstanceOf(Float64Array);
    expect(Array.from(chamadas.ultimoViewProj)).toEqual(Array.from(viewProj));
    expect(chamadas.ultimoAlvo).toBe(alvo);
    expect(saida).toEqual({ drawn: 66, refused: false, reason: 'aceito', totalCasters: 2 });
  });

  it('traduz a recusa do gate em motivo, sem desenhar nada', () => {
    // Retorno negativo é recusa, e o motivo tem de chegar legível: uma recusa
    // sem causa vira "não funciona" e só aparece com depurador.
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.add(malha());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    chamadas.proximaResposta = -8;
    const saida = espelho.drawShadowPass(
      new OrthographicCamera(-50, 50, 50, -50, 1, 200),
      new Vector3(),
      0.15,
      new Float64Array(16),
      {},
      977,
      false,
    );

    expect(saida?.refused).toBe(true);
    expect(saida?.reason).toBe('geometria-ausente');
    expect(saida?.drawn).toBe(0);
    expect(saida?.totalCasters).toBe(2);
    expect(chamadas.ultimosNosDaCena).toBe(977);
  });

  it('repassa o tipo de shadow map, que só o JS enxerga', () => {
    // Com VSM o `three` não inverte o lado da face e passa a desenhar também os
    // `receiveShadow`: o passe nativo é depth-only e tem de RECUSAR o caso.
    const { chamadas } = instalarPonteFalsa(8);
    const espelho = new NativeSceneMirror();
    espelho.install(new Object3D());

    espelho.drawShadowPass(
      new OrthographicCamera(),
      new Vector3(),
      0.15,
      new Float64Array(16),
      {},
      -1,
      true,
    );

    expect(chamadas.ultimoVsm).toBe(true);
  });

  it('não desenha quando o host não tem o passe de sombra', () => {
    // Host antigo: o passe ausente NÃO pode virar um "desenhou" por omissão —
    // quem responde `undefined` deixa o `three` continuar desenhando a sombra.
    instalarPonteFalsa(8);
    delete (globalThis as Record<string, Record<string, unknown>>)['__cortexSceneMirror']![
      'drawShadowPass'
    ];
    const espelho = new NativeSceneMirror();
    espelho.install(new Object3D());

    expect(
      espelho.drawShadowPass(
        new OrthographicCamera(),
        new Vector3(),
        0.15,
        new Float64Array(16),
        {},
        -1,
        false,
      ),
    ).toBeUndefined();
  });

  // ── E6 da SPEC-0245: a cena que muda depois do install ────────────────────

  it('acrescenta ao espelho, no mesmo frame, o nó que a cena ganha depois', () => {
    // O motivo do evento: contar nós roda na travessia amortizada de 10
    // frames, e nesses 10 frames um nó novo com `castShadow` autorado (o
    // projétil do kart) seria aceito sem estar no espelho.
    const { chamadas } = instalarPonteFalsa(32);
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    expect(espelho.nodeCount).toBe(1);

    const novo = malha();
    raiz.add(novo);

    expect(chamadas.appendNodes).toBe(1);
    expect(espelho.nodeCount).toBe(2);
    expect(novo.matrixWorldAutoUpdate).toBe(false);
  });

  it('manda a subárvore nova inteira numa chamada só, pai antes de filho', () => {
    // Uma travessia de ponte por evento, não uma por nó: o projétil do kart
    // tem 4 primitives, e 15 us por travessia (SPEC-0225) por nó pagaria caro
    // por tiro.
    const { chamadas } = instalarPonteFalsa(32);
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    const grupo = new Object3D();
    grupo.add(malha(), malha());
    raiz.add(grupo);

    expect(chamadas.appendNodes).toBe(1);
    expect(espelho.nodeCount).toBe(4);
    const d = chamadas.ultimaDescricaoAppend;
    expect(d.length / FLOATS_POR_NO).toBe(3);
    // O pai da raiz do lote é índice absoluto; o dos de dentro é posição no
    // lote, codificada como -2 - posicao.
    expect(d[0]).toBe(0);
    expect(d[FLOATS_POR_NO]).toBe(-2);
    expect(d[FLOATS_POR_NO * 2]).toBe(-2);
  });

  it('a fatia entregue no install continua apontando para o mesmo nó depois do append', () => {
    // É a promessa inteira da capacidade reservada: o append não realoca, e
    // quem já tinha `matrixWorld.elements` não precisa ser reapontado.
    const { matrices } = instalarPonteFalsa(32);
    const raiz = new Object3D();
    const antigo = new Object3D();
    raiz.add(antigo);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    const fatiaDoAntigo = antigo.matrixWorld.elements;

    raiz.add(new Object3D());

    expect(antigo.matrixWorld.elements).toBe(fatiaDoAntigo);
    matrices[16 + 12] = 9; // nó 1 = `antigo`
    expect(antigo.matrixWorld.elements[12]).toBe(9);
  });

  it('pega também o nó que chega por attach, e não só por add', () => {
    // `attach`, `clear`, `removeFromParent` e `copy` do `three` passam todos
    // por `add`/`remove`, e são eles que disparam o evento — conferido no
    // fonte do `Object3D`.
    const { chamadas } = instalarPonteFalsa(32);
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    raiz.attach(new Object3D());

    expect(chamadas.appendNodes).toBe(1);
    expect(espelho.nodeCount).toBe(2);
  });

  it('tira do espelho a subárvore removida e devolve o matrixWorld ao three', () => {
    // O slot pode ser reaproveitado por outro nó (pool de hazards), então o
    // objeto que sai não pode continuar lendo a memória dele.
    const { chamadas, matrices } = instalarPonteFalsa(32);
    const raiz = new Object3D();
    const grupo = new Object3D();
    grupo.add(new Object3D());
    raiz.add(grupo);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    expect(espelho.nodeCount).toBe(3);
    const neto = grupo.children[0]!;

    raiz.remove(grupo);

    expect(chamadas.removeNode).toBe(1);
    expect(chamadas.ultimoRemovido).toBe(1);
    expect(espelho.nodeCount).toBe(1);
    expect(grupo.matrixWorldAutoUpdate).toBe(true);
    expect(neto.matrixWorldAutoUpdate).toBe(true);
    // O `elements` é agora dele, não uma janela para a memória nativa.
    matrices[16 + 12] = 77;
    expect(grupo.matrixWorld.elements[12]).not.toBe(77);
    // E ele parou de escutar: mexer nele depois não fala mais com o host.
    grupo.add(new Object3D());
    expect(chamadas.appendNodes).toBe(0);
  });

  it('não manda linha de sincronização do slot que saiu da cena', () => {
    // Mandar a linha de uma lápide ressuscitaria, do lado C++, um nó que o
    // `three` já não tem — e o slot pode ter dono novo.
    const { chamadas } = instalarPonteFalsa(32);
    const raiz = new Object3D();
    const some = new Object3D();
    const fica = new Object3D();
    raiz.add(some, fica);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    // Os dois sujam ANTES da remoção: o slot de `some` fica na lista de sujos
    // e tem de ser pulado, não mandado.
    some.position.x = 1;
    fica.position.x = 1;
    raiz.remove(some);
    some.position.x = 2; // e depois de sair, nem suja mais nada
    espelho.update(new PerspectiveCamera());

    expect(chamadas.ultimoChanged).toBe(1);
  });

  it('estouro de capacidade desliga o espelho em vez de realocar', () => {
    // Realocar do lado C++ deixaria todo `matrixWorld.elements` já entregue
    // sobre memória liberada — e erro nessa fronteira aparece como artefato
    // visual, não como exceção (SPEC-0234). Recusar custa só os milissegundos
    // do marco.
    const { matrices } = instalarPonteFalsa(2);
    const raiz = new Object3D();
    const filho = new Object3D();
    raiz.add(filho);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    expect(espelho.installed).toBe(true);

    raiz.add(new Object3D()); // não cabe: a ponte falsa recusa

    expect(espelho.installed).toBe(false);
    expect(espelho.overflowed).toBe(true);
    // Ninguém ficou lendo a memória nativa.
    matrices[16 + 12] = 55;
    expect(filho.matrixWorld.elements[12]).not.toBe(55);
    expect(filho.matrixWorldAutoUpdate).toBe(true);
  });

  it('lança quando o append é recusado, para quem chama por fora do evento', () => {
    // Dentro do evento a exceção é engolida (ela subiria pelo `add()` de
    // código alheio); na API direta ela é o relato.
    instalarPonteFalsa(2);
    const raiz = new Object3D();
    raiz.add(new Object3D());
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    expect(() => espelho.appendSubtree(new Object3D(), 0)).toThrow(/recusado/);
  });

  it('é inerte quando o host não sabe acrescentar nó', () => {
    // Host antigo: sem `appendNodes`, a cena que cresce volta a ser divergência
    // de contagem — que o gate já recusa —, e nada pode quebrar por isso.
    const { chamadas } = instalarPonteFalsa(32);
    delete (globalThis as Record<string, Record<string, unknown>>)['__cortexSceneMirror']![
      'appendNodes'
    ];
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);

    raiz.add(new Object3D());

    expect(chamadas.appendNodes).toBe(0);
    expect(espelho.installed).toBe(true);
    expect(espelho.nodeCount).toBe(1);
  });
});

// ── SPEC-0289: streaming de LOD e InstancedMesh no passe nativo ─────────────

describe('NativeSceneMirror com streaming e instancing (SPEC-0289)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  /** Acrescenta `setInstances` à ponte falsa e devolve o log das chamadas. */
  function comSetInstances(): { indice: number; quantas: number; primeira: number }[] {
    const log: { indice: number; quantas: number; primeira: number }[] = [];
    const ponte = (globalThis as unknown as Record<string, Record<string, unknown>>)[
      '__cortexSceneMirror'
    ]!;
    ponte['setInstances'] = (indice: number, matrizes: Float32Array, quantas: number) => {
      log.push({ indice, quantas, primeira: matrizes[12] ?? NaN });
      return true;
    };
    return log;
  }

  function lote(capacidade: number): InstancedMesh {
    const im = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), capacidade);
    im.castShadow = true;
    return im;
  }

  it('entrega ao registro a geometria de malha que entrou DEPOIS do install', () => {
    // A causa medida do `geometria-ausente`: o registro só varria a cena do
    // primeiro frame, e todo LOD do streaming ficava desconhecido para sempre.
    instalarPonteFalsa(32);
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    expect(espelho.drainNewGeometries()).toEqual([]);

    const grupo = new Object3D();
    const lod = malha();
    grupo.add(lod);
    raiz.add(grupo);

    expect(espelho.drainNewGeometries()).toEqual([lod.geometry]);
    // Drenar esvazia: a mesma geometria não é entregue duas vezes.
    expect(espelho.drainNewGeometries()).toEqual([]);
  });

  it('não corta InstancedMesh pela esfera (ela não descreve o lote)', () => {
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.add(lote(4));
    new NativeSceneMirror().install(raiz);
    const flags = chamadas.ultimaDescricao[FLOATS_POR_NO + CAMPO_FLAGS]!;
    expect(flags & FLAG_INSTANCED).toBe(FLAG_INSTANCED);
    expect(flags & FLAG_FRUSTUM_CULLED).toBe(0);
  });

  it('manda as matrizes de instância só quando version ou count mudam', () => {
    instalarPonteFalsa(8);
    const log = comSetInstances();
    const raiz = new Object3D();
    const im = lote(4);
    im.count = 2;
    im.instanceMatrix.array[12] = 5; // translação x da 1ª instância
    raiz.add(im);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    const camera = new PerspectiveCamera();

    espelho.update(camera);
    expect(log).toEqual([{ indice: 1, quantas: 2, primeira: 5 }]);

    espelho.update(camera); // nada mudou: nenhuma travessia de ponte
    expect(log).toHaveLength(1);

    im.count = 3; // slot novo do streaming
    im.instanceMatrix.needsUpdate = true;
    espelho.update(camera);
    expect(log).toHaveLength(2);
    expect(log[1]!.quantas).toBe(3);
  });

  it('para de mandar matrizes do lote que saiu da cena', () => {
    instalarPonteFalsa(8);
    const log = comSetInstances();
    const raiz = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    const im = lote(2);
    raiz.add(im); // entra pelo evento, como o lote do streaming
    const camera = new PerspectiveCamera();
    espelho.update(camera);
    expect(log).toHaveLength(1);

    raiz.remove(im);
    im.instanceMatrix.needsUpdate = true;
    espelho.update(camera);
    expect(log).toHaveLength(1);
  });

  it('host sem setInstances: segue sem erro (o gate recusa `instanced`)', () => {
    instalarPonteFalsa(8);
    const raiz = new Object3D();
    raiz.add(lote(2));
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    expect(() => espelho.update(new PerspectiveCamera())).not.toThrow();
  });
});

// ── SPEC-0322: só o que mudou — paridade com o espelho completo ─────────────
//
// O espelho completo mandava TODO nó TODO quadro, então o host sempre tinha o
// estado verdadeiro da cena. O novo manda só os sujos. A paridade compara o
// estado que o host guardou (a ponte falsa aplica as linhas como o
// `applyTransforms`) com o estado verdadeiro, depois de cada tipo de mutação.
// Erro aqui é sombra/matriz errada sem exceção — já aconteceu 3× (SPEC-0245).

describe('NativeSceneMirror sincroniza só o que mudou (SPEC-0322)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  /** Tabela do `three` (premissa 4 da SPEC-0246), escrita à parte do código. */
  function ladoEsperado(o: Object3D): number {
    const m = (o as Mesh).material as (MeshBasicMaterial & { shadowSide: number | null }) | undefined;
    if (!m || Array.isArray(m)) return LADO_BACK;
    if (m.shadowSide !== null && m.shadowSide !== undefined) {
      if (m.shadowSide === FrontSide) return LADO_FRONT;
      return m.shadowSide === BackSide ? LADO_BACK : LADO_DOUBLE;
    }
    if (m.side === FrontSide) return LADO_BACK;
    return m.side === BackSide ? LADO_FRONT : LADO_DOUBLE;
  }

  /** O que o espelho COMPLETO teria mandado para o nó. */
  function verdade(o: Object3D): number[] {
    const m = (o as Mesh).material as MeshBasicMaterial | undefined;
    const flags =
      (o.visible ? SYNC_VISIVEL : 0) |
      (m && m.visible ? SYNC_MATERIAL_VISIVEL : 0) |
      (ladoEsperado(o) << SYNC_LADO_SHIFT) |
      mainPassFrameFlags(o);
    const p = o.position;
    const q = o.quaternion;
    const s = o.scale;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z, flags];
  }

  /** Tolerância: a semente vem da descrição em float32; a linha é double. */
  const TOLERANCIA = 1e-5;

  /** Nós que divergem entre host e cena; vazio = paridade. */
  function divergencias(
    raiz: Object3D,
    espelho: NativeSceneMirror,
    host: Map<number, number[]>,
  ): string[] {
    const indices = (espelho as unknown as { _indicePorObjeto: Map<Object3D, number> })
      ._indicePorObjeto;
    const ruins: string[] = [];
    raiz.traverse((o) => {
      const i = indices.get(o);
      if (i === undefined) {
        ruins.push(`${o.name}: fora do espelho`);
        return;
      }
      const noHost = host.get(i)!;
      const esperado = verdade(o);
      for (let k = 0; k < esperado.length; k++) {
        if (Math.abs(noHost[k]! - esperado[k]!) > TOLERANCIA) {
          ruins.push(`${o.name}[${k}]: host=${noHost[k]} cena=${esperado[k]}`);
          return;
        }
      }
    });
    return ruins;
  }

  function cena() {
    const raiz = new Object3D();
    raiz.name = 'raiz';
    const carro = new Object3D();
    carro.name = 'carro';
    const roda = malha();
    roda.name = 'roda';
    const predio = malha();
    predio.name = 'predio';
    const compartilhado = new MeshBasicMaterial();
    const poste1 = new Mesh(new BoxGeometry(1, 1, 1), compartilhado);
    poste1.name = 'poste1';
    const poste2 = new Mesh(new BoxGeometry(1, 1, 1), compartilhado);
    poste2.name = 'poste2';
    carro.add(roda);
    raiz.add(carro, predio, poste1, poste2);
    return { raiz, carro, roda, predio, poste1, poste2, compartilhado };
  }

  it('cada mutação chega ao host: transform no MESMO quadro, flags dentro da volta', () => {
    const { host } = instalarPonteFalsa(64);
    const c = cena();
    const espelho = new NativeSceneMirror();
    espelho.install(c.raiz);
    const camera = new PerspectiveCamera();
    espelho.update(camera);
    expect(divergencias(c.raiz, espelho, host)).toEqual([]);

    // Cada passo: muta, UM update, paridade. A cena tem menos que
    // SWEEP_MIN_NODES nós, então a varredura a cobre inteira por quadro.
    const passos: [string, () => void][] = [
      ['position.set', () => c.carro.position.set(10, 0, -3)],
      ['position.x direto', () => (c.roda.position.x = 0.7)],
      ['position.copy', () => c.predio.position.copy(new Vector3(1, 2, 3))],
      ['fromArray (AnimationMixer)', () => c.roda.position.fromArray([4, 5, 6])],
      ['rotation.y (Euler, sem callback do quaternion)', () => (c.carro.rotation.y = 1.2)],
      ['rotation.set', () => c.roda.rotation.set(0.1, 0.2, 0.3)],
      [
        'quaternion.setFromAxisAngle',
        () => c.predio.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.5),
      ],
      ['quaternion.x direto', () => (c.poste1.quaternion.x = 0.1)],
      ['scale.setScalar', () => c.poste2.scale.setScalar(2)],
      ['lookAt', () => c.carro.lookAt(5, 5, 5)],
      [
        'applyMatrix4 (decompose)',
        () => c.predio.applyMatrix4(new Matrix4().makeTranslation(1, 1, 1)),
      ],
      ['translateZ', () => c.carro.translateZ(2)],
      ['esconder', () => (c.predio.visible = false)],
      ['mostrar', () => (c.predio.visible = true)],
      ['material.visible', () => ((c.roda.material as MeshBasicMaterial).visible = false)],
      ['side do material compartilhado', () => (c.compartilhado.side = DoubleSide)],
      [
        'shadowSide autorado',
        () => ((c.compartilhado as unknown as { shadowSide: number }).shadowSide = BackSide),
      ],
      [
        'trocar o material do nó',
        () => (c.poste1.material = new MeshBasicMaterial({ side: BackSide })),
      ],
      // castShadow é autoria do BUILD (o C++ reaplica o filtro), nunca viajou
      // por quadro — nem no espelho completo. Paridade = continuar sem divergir.
      ['castShadow', () => (c.predio.castShadow = !c.predio.castShadow)],
    ];
    for (const [nome, mutar] of passos) {
      mutar();
      espelho.update(camera);
      expect(divergencias(c.raiz, espelho, host), nome).toEqual([]);
    }
  });

  it('grupo que se move manda UMA linha; o filho segue pela hierarquia do host', () => {
    // A matriz do filho é recomposta pelo C++ (pai sujo propaga); o que o JS
    // tem de mandar é só o transform local de quem mudou.
    const { host, chamadas } = instalarPonteFalsa(64);
    const c = cena();
    const espelho = new NativeSceneMirror();
    espelho.install(c.raiz);
    const camera = new PerspectiveCamera();
    espelho.update(camera);

    c.carro.position.z += 1;
    espelho.update(camera);
    expect(chamadas.ultimoChanged).toBe(1);
    expect(divergencias(c.raiz, espelho, host)).toEqual([]);
  });

  it('add/remove/re-add: o nó novo nasce certo e o que saiu solta os ganchos', () => {
    const { host, chamadas } = instalarPonteFalsa(64);
    const c = cena();
    const espelho = new NativeSceneMirror();
    espelho.install(c.raiz);
    const camera = new PerspectiveCamera();

    const novo = new Object3D();
    novo.name = 'novo';
    novo.add(malha());
    c.carro.add(novo); // dentro de um grupo que se move
    novo.position.set(1, 2, 3);
    c.carro.position.y = 9;
    espelho.update(camera);
    expect(divergencias(c.raiz, espelho, host)).toEqual([]);

    c.raiz.remove(c.predio);
    // Fora do espelho, o vetor volta a ser dado cru e não suja nada.
    expect(Object.getOwnPropertyDescriptor(c.predio.position, 'x')?.value).toBeDefined();
    c.predio.position.x = 99;
    espelho.update(camera);
    expect(chamadas.ultimoChanged).toBe(0);

    c.raiz.add(c.predio); // volta, num slot novo, com o transform que tem agora
    expect(divergencias(c.raiz, espelho, host)).toEqual([]);
    c.predio.position.x = 5;
    espelho.update(camera);
    expect(divergencias(c.raiz, espelho, host)).toEqual([]);
  });

  it('cena grande: transform no mesmo quadro, flags em até SWEEP_PERIOD_FRAMES', () => {
    const total = SWEEP_MIN_NODES * SWEEP_PERIOD_FRAMES * 2;
    const { host } = instalarPonteFalsa(total + 8);
    const raiz = new Object3D();
    const nos: Mesh[] = [];
    for (let i = 0; i < total; i++) {
      const m = malha();
      m.name = `n${i}`;
      nos.push(m);
      raiz.add(m);
    }
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    const camera = new PerspectiveCamera();

    // Parada: nada sincroniza.
    espelho.update(camera);
    expect(espelho.syncedNodes).toBe(0);

    // Transform: o mesmo quadro, mesmo longe do cursor da varredura.
    nos[total - 1]!.position.y = 4;
    nos[3]!.rotation.x = 0.4;
    espelho.update(camera);
    expect(espelho.syncedNodes).toBe(2);
    expect(divergencias(raiz, espelho, host)).toEqual([]);

    // Flags: espalhadas pela cena, chegam dentro de uma volta da varredura.
    const PASSO_ESCONDE = 97;
    const PASSO_LADO = 131;
    for (let i = 0; i < total; i += PASSO_ESCONDE) nos[i]!.visible = false;
    for (let i = 5; i < total; i += PASSO_LADO) {
      (nos[i]!.material as MeshBasicMaterial).side = DoubleSide;
    }
    for (let q = 0; q < SWEEP_PERIOD_FRAMES; q++) espelho.update(camera);
    expect(divergencias(raiz, espelho, host)).toEqual([]);

    // Reescrever o MESMO valor (o `copy` de um alvo parado) não suja.
    nos[7]!.position.copy(nos[7]!.position.clone());
    nos[8]!.scale.set(1, 1, 1);
    // E a cena volta a ficar parada.
    espelho.update(camera);
    expect(espelho.syncedNodes).toBe(0);
    expect(espelho.takeAverageSyncedNodes()).toBeGreaterThan(0);
    expect(espelho.takeAverageSyncedNodes()).toBe(0);
  });
});

describe('NativeSceneMirror e o passe principal (SPEC-0332)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
    delete (globalThis as Record<string, unknown>)['__cortexMainPass'];
  });

  it('visible chega ao host no MESMO quadro, sem esperar a varredura', () => {
    const { host } = instalarPonteFalsa(64);
    const raiz = new Object3D();
    const nos: Mesh[] = [];
    for (let i = 0; i < 40; i++) {
      const m = malha();
      nos.push(m);
      raiz.add(m);
    }
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    const camera = new PerspectiveCamera();
    espelho.update(camera);
    expect(espelho.syncedNodes).toBe(0);
    nos[39]!.visible = false;
    espelho.update(camera);
    expect(espelho.syncedNodes).toBe(1);
    expect(flagsNoHost(host, 40) & SYNC_VISIVEL).toBe(0);
    // Escrever o mesmo valor não suja.
    nos[39]!.visible = false;
    espelho.update(camera);
    expect(espelho.syncedNodes).toBe(0);
  });

  it('syncPending manda a escrita feita depois do update', () => {
    const { chamadas } = instalarPonteFalsa(8);
    const raiz = new Object3D();
    const m = malha();
    raiz.add(m);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    espelho.update(new PerspectiveCamera());
    const antes = chamadas.update;
    espelho.syncPending();
    expect(chamadas.update).toBe(antes); // nada sujo: nenhuma travessia
    m.position.x = 3;
    espelho.syncPending();
    expect(chamadas.update).toBe(antes + 1);
    expect(chamadas.ultimoChanged).toBe(1);
  });

  it('troca de geometria manda a esfera nova pela varredura', () => {
    instalarPonteFalsa(8);
    const bounds: number[][] = [];
    (globalThis as Record<string, unknown>)['__cortexMainPass'] = {
      project: () => 0,
      setBounds: (i: number, x: number, y: number, z: number, r: number) => bounds.push([i, x, y, z, r]),
    };
    const raiz = new Object3D();
    const m = malha();
    raiz.add(m);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    const camera = new PerspectiveCamera();
    espelho.update(camera);
    expect(bounds).toEqual([]);
    m.geometry = new BoxGeometry(10, 10, 10);
    espelho.update(camera);
    expect(bounds.length).toBe(1);
    expect(bounds[0]![0]).toBe(1);
    expect(bounds[0]![4]).toBeCloseTo(Math.sqrt(75));
  });

  it('removeSubtree devolve o visible como propriedade comum', () => {
    instalarPonteFalsa(8);
    const raiz = new Object3D();
    const m = malha();
    raiz.add(m);
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    m.visible = false;
    raiz.remove(m);
    expect(Object.getOwnPropertyDescriptor(m, 'visible')?.get).toBeUndefined();
    expect(m.visible).toBe(false);
  });
});

describe('NativeSceneMirror: matriz de mundo fresca sob pedido (SPEC-0340)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  /** A matriz da ponte falsa é float32: a comparação tolera o arredondamento. */
  const TOLERANCIA = 1e-4;

  /** O que o `three` puro (sem espelho) daria para o nó. */
  function mundoDoThree(raiz: Object3D, alvo: Object3D): Matrix4 {
    const copia = raiz.clone(true);
    copia.updateMatrixWorld(true);
    let achado: Object3D | undefined;
    copia.traverse((o) => {
      if (o.name === alvo.name) achado = o;
    });
    return achado!.matrixWorld.clone();
  }

  function cenaDoCarro() {
    const raiz = new Object3D();
    raiz.name = 'raiz';
    const carro = new Object3D();
    carro.name = 'carro';
    const lente = new Object3D();
    lente.name = 'lente';
    lente.position.set(0.55, 0.7, 1.975);
    carro.add(lente);
    raiz.add(carro);
    return { raiz, carro, lente };
  }

  it('updateWorldMatrix no meio do quadro devolve a pose ATUAL, não a do último render', () => {
    const { matrices } = instalarPonteFalsa(16);
    const { raiz, carro, lente } = cenaDoCarro();
    const espelho = new NativeSceneMirror();
    expect(espelho.install(raiz)).toBe(true);
    espelho.update(new PerspectiveCamera()); // "render" do quadro anterior

    // O sistema de veículo anda com o carro; o das luzes pede a pose depois.
    carro.position.set(12, 0, -40);
    carro.rotation.y = 0.8;
    lente.updateWorldMatrix(true, false);

    const esperado = mundoDoThree(raiz, lente).elements;
    for (let k = 0; k < 16; k++) expect(lente.matrixWorld.elements[k]).toBeCloseTo(esperado[k]!, 4);
    // Escreveu na memória nativa (sem cópia): o C++ recalcularia o mesmo valor.
    expect(lente.matrixWorld.elements.buffer).toBe(matrices.buffer);
    // getWorldPosition passa pelo mesmo caminho.
    const p = carro.getWorldPosition(new Vector3());
    expect(p.distanceTo(new Vector3(12, 0, -40))).toBeLessThan(TOLERANCIA);
  });

  it('updateMatrixWorld em massa segue desligada (custo que o espelho elimina)', () => {
    instalarPonteFalsa(16);
    const { raiz, carro } = cenaDoCarro();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    espelho.update(new PerspectiveCamera());
    const antes = Array.from(carro.matrixWorld.elements);
    carro.position.set(5, 0, 5);
    raiz.updateMatrixWorld(true);
    expect(Array.from(carro.matrixWorld.elements)).toEqual(antes);
  });

  it('nó que sai do espelho volta ao updateWorldMatrix do protótipo', () => {
    instalarPonteFalsa(16);
    const { raiz, carro } = cenaDoCarro();
    const espelho = new NativeSceneMirror();
    espelho.install(raiz);
    raiz.remove(carro);
    expect(Object.prototype.hasOwnProperty.call(carro, 'updateWorldMatrix')).toBe(false);
    carro.position.set(3, 0, 0);
    carro.updateWorldMatrix(true, false);
    expect(carro.matrixWorld.elements[12]).toBe(3);
  });
});
