/**
 * Estado por slot do espelho de cena (SPEC-0322, SPEC-0332, SPEC-0372,
 * SPEC-0678): quem está sujo, a varredura em rodízio das flags do quadro, os
 * ancestrais ocultos, a esfera da geometria e as matrizes de instância.
 *
 * É a base do `NativeSceneMirror`, que cuida da árvore (install, eventos,
 * append/remove) e do passe de sombra. A divisão é a da SPEC-0678 (SPEC-0668).
 */
import type { BufferGeometry, Object3D } from 'three';
import { MainPassKind, mainPassKind, mainPassUnsupportedType } from '../../render/MainPassKind.js';
import { hostSceneMirrorBridge, mainPassBridge, type SceneMirrorBridge } from './mirrorBridge.js';
import { engancharNo, type MirrorSink, type ObjetoEnganchado, type VetorEnganchado } from './mirrorHooks.js';
import {
  ESTATICO_GRUPO,
  ESTATICO_SEM_QUADRO,
  ESTATICO_TIPO_RECUSADO,
  FRUSTUM_FLOATS,
  MATRIX_ELEMENTS,
  SWEEP_MIN_NODES,
  SWEEP_PERIOD_FRAMES,
  SYNC_FLAGS,
  SYNC_FLOATS_PER_NODE,
  escreverTrsDaMatriz,
  flagsDoQuadro,
  geometriaDeDesenho,
  semFlagsDoQuadro,
  temRecorteAlfa,
  type NoDaCena,
} from './mirrorLayout.js';

/** Lista vazia compartilhada: o caso comum de {@link MirrorSlots.drainNewGeometries}. */
const SEM_GEOMETRIAS: BufferGeometry[] = [];

export abstract class MirrorSlots implements MirrorSink {
  protected readonly _bridge = hostSceneMirrorBridge();
  /** Um por slot do espelho; `undefined` é slot de nó que saiu da cena. */
  protected _nodes: (Object3D | undefined)[] = [];
  protected _sync: Float64Array | undefined;
  protected _installed = false;
  protected readonly _planes = new Float32Array(FRUSTUM_FLOATS);
  /** Índice de cada objeto espelhado — o que o evento precisa resolver em O(1). */
  protected _indicePorObjeto = new Map<Object3D, number>();
  /** As matrizes de mundo do host, cobrindo a CAPACIDADE (não só o tamanho). */
  protected _matrizes: Float64Array | undefined;
  /** Nós vivos: `_nodes` guarda slots, e um removido vira buraco. */
  protected _liveCount = 0;
  /** Sobe a cada `install`: o host esquece os recortes quando o espelho renasce. */
  protected _geracao = 0;
  /**
   * Geometrias de malhas que entraram DEPOIS do `install` e ainda não foram
   * entregues ao registro de geometria (SPEC-0289). Sem isto o registro só
   * conhecia a cena do primeiro frame, e todo LOD do streaming virava
   * `geometria-ausente` para sempre. `Set`: limitado às geometrias distintas,
   * mesmo que ninguém drene (passe nativo desligado).
   */
  protected readonly _geometriasNovas = new Set<BufferGeometry>();
  /**
   * `InstancedMesh` espelhados → o que o host já tem deles (`version` do
   * `instanceMatrix` e `count`). As matrizes só atravessam a ponte quando um
   * dos dois muda (SPEC-0289); `-1` = nunca mandado.
   */
  protected readonly _instanciados = new Map<NoDaCena, { versao: number; quantas: number }>();
  /** Nós marcados com recorte alfa — quem o `ShadowAlphaClipSync` acompanha (SPEC-0642). */
  protected readonly _recorteAlfa = new Set<Object3D>();
  // ── Só o que mudou (SPEC-0322) — tudo dimensionado pela CAPACIDADE ──────
  /** 1 = slot já está em {@link _listaSujos} neste quadro. */
  protected _sujoMarca = new Uint8Array(0);
  /** Slots sujos do quadro, na ordem em que sujaram. */
  protected _listaSujos = new Int32Array(0);
  protected _qtdSujos = 0;
  /** Últimas flags do quadro mandadas ao host, por slot (ver {@link SYNC_FLAGS}). */
  protected _flagsEnviadas = new Uint8Array(0);
  /** Ramo do `_projectObject` de cada slot (SPEC-0332) — o tipo do nó não muda. */
  protected _tipoPorSlot = new Uint8Array(0);
  /** `ESTATICO_*` de cada slot: tipo recusado / é `Group` / sem flag do quadro. */
  protected _estaticoPorSlot = new Uint8Array(0);
  /** Geometria cuja esfera o host tem, por slot (SPEC-0332). */
  protected _geometriaPorSlot: (BufferGeometry | undefined)[] = [];
  /** How many mirrored ancestors of the slot are hidden; the sweep skips > 0 (SPEC-0372). */
  protected _ocultoAcima = new Uint16Array(0);
  protected readonly _pilhaOculto: Object3D[] = [];
  protected readonly _mainPass = mainPassBridge();
  /** Onde a varredura das flags parou. */
  protected _cursorVarredura = 0;
  protected _sincronizadosNoQuadro = 0;
  protected _somaSincronizados = 0;
  protected _quadrosSomados = 0;

  get installed(): boolean {
    return this._installed;
  }

  /** Nós espelhados com recorte alfa (`alphaTest`/`alphaMap`, SPEC-0642). */
  get alphaClipNodes(): ReadonlySet<Object3D> {
    return this._recorteAlfa;
  }

  /** Índice do nó no espelho, ou `undefined` se ele não está espelhado. */
  nodeIndex(objeto: Object3D): number | undefined {
    return this._indicePorObjeto.get(objeto);
  }

  /** Geração do espelho: muda a cada `install` (o host limpa o que era por nó). */
  get generation(): number {
    return this._geracao;
  }

  /**
   * Entrega (e esquece) as geometrias das malhas que entraram no espelho desde
   * a última chamada — quem drena é o registro de geometria (SPEC-0289).
   */
  drainNewGeometries(): BufferGeometry[] {
    if (this._geometriasNovas.size === 0) return SEM_GEOMETRIAS;
    const lista = [...this._geometriasNovas];
    this._geometriasNovas.clear();
    return lista;
  }

  /** Nós VIVOS no espelho — é o que se compara com a contagem da cena. */
  get nodeCount(): number {
    return this._liveCount;
  }

  /**
   * Nós sincronizados (linhas mandadas ao host) no último `update`
   * (SPEC-0322). Cena parada tem de ficar perto de zero; carro andando, não.
   */
  get syncedNodes(): number {
    return this._sincronizadosNoQuadro;
  }

  /** Média de {@link syncedNodes} desde a última chamada, e zera a janela. */
  takeAverageSyncedNodes(): number {
    const media = this._quadrosSomados > 0 ? this._somaSincronizados / this._quadrosSomados : 0;
    this._somaSincronizados = 0;
    this._quadrosSomados = 0;
    return media;
  }

  /**
   * Marca o slot para mandar linha no próximo `update`. Chamado pelos
   * ganchos de transform (SPEC-0322); interno, público só para eles.
   * @internal
   */
  _marcarSujo(slot: number): void {
    if (this._sujoMarca[slot] !== 0) return;
    this._sujoMarca[slot] = 1;
    this._listaSujos[this._qtdSujos++] = slot;
  }

  /** @internal Chamado pelo gancho de `visible` quando o nó volta a aparecer. */
  _reapareceu(slot: number): void {
    const objeto = this._nodes[slot];
    if (this._installed && objeto) this._conferirGeometria(objeto, slot);
  }

  /** Dimensiona os vetores por slot pela capacidade do host. */
  protected _reservarPorSlot(capacidade: number): void {
    this._sujoMarca = new Uint8Array(capacidade);
    this._listaSujos = new Int32Array(capacidade);
    this._flagsEnviadas = new Uint8Array(capacidade);
    this._tipoPorSlot = new Uint8Array(capacidade);
    this._estaticoPorSlot = new Uint8Array(capacidade);
    this._geometriaPorSlot = new Array<BufferGeometry | undefined>(capacidade);
    this._ocultoAcima = new Uint16Array(capacidade);
    this._qtdSujos = 0;
    this._cursorVarredura = 0;
  }

  /** O slot entra no espelho: gancho + flags de partida (as do `build`). */
  protected _adotar(objeto: Object3D, slot: number): void {
    this._tipoPorSlot[slot] = mainPassKind(objeto);
    this._estaticoPorSlot[slot] =
      (mainPassUnsupportedType(objeto) ? ESTATICO_TIPO_RECUSADO : 0) |
      ((objeto as Object3D & { isGroup?: boolean }).isGroup === true ? ESTATICO_GRUPO : 0) |
      (semFlagsDoQuadro(objeto) ? ESTATICO_SEM_QUADRO : 0);
    this._geometriaPorSlot[slot] = geometriaDeDesenho(objeto as NoDaCena);
    const pai = objeto.parent;
    const paiSlot = pai ? this._indicePorObjeto.get(pai) : undefined;
    this._ocultoAcima[slot] = paiSlot === undefined ? 0 : this._ocultoAcima[paiSlot]! + (pai!.visible ? 0 : 1);
    engancharNo(objeto, this, slot);
    // Depois do gancho: as flags leem o `visible` do armazenamento dele.
    this._flagsEnviadas[slot] = flagsDoQuadro(objeto, this._estaticoPorSlot[slot]!);
  }

  /** A cena espelhada (o slot 0 do `install`), ou `undefined`. */
  get root(): Object3D | undefined {
    return this._installed ? this._nodes[0] : undefined;
  }

  /**
   * O que a projeção nativa lê por candidato (SPEC-0332): o objeto e o ramo
   * do `_projectObject` de cada slot.
   * @internal
   */
  _projectionView(): { nodes: readonly (Object3D | undefined)[]; kinds: Uint8Array } {
    return { nodes: this._nodes, kinds: this._tipoPorSlot };
  }

  /**
   * Manda ao host as linhas sujas desde o `update`: uma escrita feita
   * DURANTE o render, antes da projeção, entra no mesmo quadro (SPEC-0332).
   */
  syncPending(): void {
    const api = this._bridge;
    if (!api || !this._sync || !this._installed || this._qtdSujos === 0) return;
    api.update(this._escreverLinhas(), this._planes);
  }

  /** Escreve no buffer de sincronização as linhas dos slots sujos e as conta. */
  protected _escreverLinhas(): number {
    const sync = this._sync!;
    // As linhas são COMPACTAS: um slot vazio (nó que saiu da cena) é pulado, e
    // o host recebe quantas linhas foram escritas. Mandar a linha de uma lápide
    // ressuscitaria um nó que o `three` já não tem.
    const marca = this._sujoMarca;
    const lista = this._listaSujos;
    const enviadas = this._flagsEnviadas;
    let linhas = 0;
    for (let j = 0; j < this._qtdSujos; j++) {
      const i = lista[j]!;
      marca[i] = 0;
      const objeto = this._nodes[i];
      if (!objeto) continue;
      const base = linhas * SYNC_FLOATS_PER_NODE;
      linhas++;
      // Lê o armazenamento do gancho direto: todo nó vivo está enganchado, e
      // passar pelo getter aqui seria pagar uma chamada por campo.
      const posicao = objeto.position as unknown as VetorEnganchado;
      const escala = objeto.scale as unknown as VetorEnganchado;
      const q = objeto.quaternion;
      sync[base] = i;
      sync[base + 1] = posicao._mx;
      sync[base + 2] = posicao._my;
      sync[base + 3] = posicao._mz;
      sync[base + 4] = q.x;
      sync[base + 5] = q.y;
      sync[base + 6] = q.z;
      sync[base + 7] = q.w;
      sync[base + 8] = escala._mx;
      sync[base + 9] = escala._my;
      sync[base + 10] = escala._mz;
      if (!objeto.matrixAutoUpdate) escreverTrsDaMatriz(objeto, sync, base + 1);
      const flags = flagsDoQuadro(objeto, this._estaticoPorSlot[i]!);
      enviadas[i] = flags;
      sync[base + SYNC_FLAGS] = flags;
    }
    this._qtdSujos = 0;
    return linhas;
  }

  /**
   * Confere as flags do quadro de uma fatia da cena contra o que o host tem, e
   * suja o slot que divergiu (SPEC-0322). A volta inteira leva
   * {@link SWEEP_PERIOD_FRAMES} quadros; cena de até {@link SWEEP_MIN_NODES}
   * nós é varrida inteira todo quadro.
   */
  protected _varrerFlags(): void {
    const nos = this._nodes;
    const total = nos.length;
    if (total === 0) return;
    const fatia = Math.min(total, Math.max(SWEEP_MIN_NODES, Math.ceil(total / SWEEP_PERIOD_FRAMES)));
    const marca = this._sujoMarca;
    const enviadas = this._flagsEnviadas;
    const estaticos = this._estaticoPorSlot;
    const tipos = this._tipoPorSlot;
    const geometrias = this._geometriaPorSlot;
    const oculto = this._ocultoAcima;
    let cursor = this._cursorVarredura;
    for (let k = 0; k < fatia; k++) {
      if (cursor >= total) cursor = 0;
      const objeto = nos[cursor];
      // Pula (SPEC-0678): ancestral oculto, o próprio nó oculto (o acessor de
      // `visible` suja o slot quando ele volta) e o nó sem flag do quadro.
      if (
        objeto && oculto[cursor] === 0 && (objeto as unknown as ObjetoEnganchado)._mVis &&
        (estaticos[cursor]! & ESTATICO_SEM_QUADRO) === 0
      ) {
        if (marca[cursor] === 0 && flagsDoQuadro(objeto, estaticos[cursor]!) !== enviadas[cursor]) {
          this._marcarSujo(cursor);
        }
        // Teste em linha: a chamada só acontece na troca de geometria (raro).
        if (tipos[cursor] === MainPassKind.NativeCull && (objeto as NoDaCena).geometry !== geometrias[cursor]) {
          this._conferirGeometria(objeto, cursor);
        }
      }
      cursor++;
    }
    this._cursorVarredura = cursor;
  }

  /**
   * A mirrored ancestor of `raiz`'s subtree was hidden (`delta = 1`) or shown
   * (`-1`) — SPEC-0372. A slot whose counter returns to 0 is checked right
   * away: whatever changed while hidden reaches the host in the frame it
   * reappears, not up to {@link SWEEP_PERIOD_FRAMES} later.
   * @internal
   */
  _ancestralMudou(raiz: Object3D, delta: number): void {
    if (!this._installed) return;
    const pilha = this._pilhaOculto;
    for (const filho of raiz.children) pilha.push(filho);
    while (pilha.length > 0) {
      const objeto = pilha.pop()!;
      const slot = this._indicePorObjeto.get(objeto);
      if (slot === undefined) continue;
      const contador = this._ocultoAcima[slot]! + delta;
      this._ocultoAcima[slot] = contador;
      if (contador === 0) {
        if (this._sujoMarca[slot] === 0 && flagsDoQuadro(objeto, this._estaticoPorSlot[slot]!) !== this._flagsEnviadas[slot]) {
          this._marcarSujo(slot);
        }
        this._conferirGeometria(objeto, slot);
      }
      for (const filho of objeto.children) pilha.push(filho);
    }
  }

  /**
   * A geometria do nó mudou desde que o host recebeu a esfera dela: manda a
   * esfera nova (SPEC-0332). Vai pela varredura — o atraso é o dela (até
   * {@link SWEEP_PERIOD_FRAMES} quadros) e o caso é raro (troca de geometria).
   */
  protected _conferirGeometria(objeto: Object3D, slot: number): void {
    if (this._tipoPorSlot[slot] !== MainPassKind.NativeCull) return;
    const geometria = (objeto as NoDaCena).geometry;
    if (geometria === this._geometriaPorSlot[slot]) return;
    this._geometriaPorSlot[slot] = geometria;
    if (!geometria || !this._mainPass) return;
    if (!geometria.boundingSphere) geometria.computeBoundingSphere();
    const esfera = geometria.boundingSphere;
    if (!esfera) return;
    this._mainPass.setBounds(slot, esfera.center.x, esfera.center.y, esfera.center.z, esfera.radius);
  }

  /** Passa a acompanhar as matrizes de instância de um `InstancedMesh`. */
  protected _rastrearInstancias(objeto: Object3D): void {
    const no = objeto as NoDaCena;
    if (no.isInstancedMesh && no.instanceMatrix) {
      this._instanciados.set(no, { versao: -1, quantas: -1 });
    }
    // Recorte alfa (SPEC-0642): o mesmo critério da flag que o gate lê.
    if (temRecorteAlfa(no.material)) this._recorteAlfa.add(no);
  }

  /**
   * Manda ao host as matrizes de instância que mudaram desde o último frame
   * (SPEC-0289). Uma travessia de ponte por LOTE alterado, não por frame: o
   * streaming mexe em slots poucas vezes por segundo.
   */
  protected _sincronizarInstancias(api: SceneMirrorBridge): void {
    if (!api.setInstances || this._instanciados.size === 0) return;
    // `forEach` com callback fixo: o `for…of` desestruturado do Map criava
    // dois objetos por lote por quadro no Hermes (SPEC-0357).
    this._apiInstancias = api;
    this._instanciados.forEach(this._sincronizarLote);
    this._apiInstancias = null;
  }

  protected _apiInstancias: SceneMirrorBridge | null = null;
  protected readonly _sincronizarLote = (enviado: { versao: number; quantas: number }, no: NoDaCena): void => {
    const matrizes = no.instanceMatrix!;
    const quantas = no.count ?? 0;
    if (matrizes.version === enviado.versao && quantas === enviado.quantas) return;
    const indice = this._indicePorObjeto.get(no);
    if (indice === undefined) return;
    const ok = this._apiInstancias!.setInstances!(
      indice,
      matrizes.array.subarray(0, quantas * MATRIX_ELEMENTS),
      quantas,
    );
    // Recusado: fica como "não mandado" e o gate recusa o nó — tenta de novo
    // no próximo frame em vez de desenhar matriz velha.
    if (ok) {
      enviado.versao = matrizes.version;
      enviado.quantas = quantas;
    }
  };
}
