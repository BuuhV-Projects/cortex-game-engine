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
      return quantos;
    },
    removeNode: (indice: number) => {
      chamadas.removeNode++;
      chamadas.ultimoRemovido = indice;
      return 1;
    },
    update: (changed: number) => {
      chamadas.update++;
      chamadas.ultimoChanged = changed;
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

    raiz.remove(some);
    espelho.update(new PerspectiveCamera());

    expect(chamadas.ultimoChanged).toBe(2);
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
