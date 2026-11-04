/**
 * Espelho de cena nativo, lado JS (SPEC-0234, fase 3 do ADR-0232).
 *
 * A travessia de matriz do `three` custa 4,5 ms por frame no host (SPEC-0227);
 * em C++ o mesmo trabalho custa 0,023 ms. Esta classe liga os dois lados sem
 * cair nas três armadilhas já pagas em medição:
 *
 * - **ponte por objeto** (15 us cada, SPEC-0225): há **uma** chamada por frame;
 * - **laço de aplicação em JS** (≥1,4 ms para 1.300 nós): o `matrixWorld` de
 *   cada objeto **aponta** para a memória do C++, então não há cópia nenhuma;
 * - **instancing** (revertido na SPEC-0012 do jogo): não é usado.
 */
import type { Camera } from 'three';
import { Frustum, Matrix4, Object3D, Vector3 } from 'three';
import { debug } from './debug.js';
import { GATE_OUT_FIRST_OFFENDER, GATE_OUT_FLOATS, GATE_OUT_TOTAL_CASTERS, SHADOW_GATE_REASONS, type ShadowPassOutcome } from './sceneMirror/mirrorBridge.js';
import { desengancharNo } from './sceneMirror/mirrorHooks.js';
import {
  APPEND_ERROR_CAPACITY,
  BATCH_PARENT_BASE,
  BUILD_FLOATS_PER_NODE,
  FRUSTUM_FLOATS,
  MATRIX_ELEMENTS,
  descreverNo,
  escreverPlanos,
  type NoDaCena,
} from './sceneMirror/mirrorLayout.js';
import { MirrorSlots } from './sceneMirror/MirrorSlots.js';

// A API do espelho continua saindo daqui (a divisão da SPEC-0678 não muda quem importa).
export {
  SHADOW_GATE_REASONS,
  mainPassBridge,
  nativeSceneMirrorAvailable,
  type MainPassBridge,
  type ShadowGateReason,
  type ShadowPassOutcome,
} from './sceneMirror/mirrorBridge.js';
export { SWEEP_MIN_NODES, SWEEP_PERIOD_FRAMES } from './sceneMirror/mirrorLayout.js';

/**
 * O espelho instalado no frame, quando há um.
 *
 * A cena é única e o espelho é instalado uma vez, então um ponteiro de módulo
 * descreve o que é fato. Existe para quem enxerga a sombra — o nó do CSM —
 * poder pedir a contagem de casters sem que o `Game` tenha de atravessar a
 * iluminação para entregá-lo.
 */
export function activeSceneMirror(): NativeSceneMirror | undefined {
  return espelhoInstalado;
}

let espelhoInstalado: NativeSceneMirror | undefined;

export class NativeSceneMirror extends MirrorSlots {
  private readonly _frustum = new Frustum();
  private readonly _viewProjection = new Matrix4();
  /** Buffers do passe de sombra, separados para não brigar com o do frame. */
  private readonly _shadowPlanes = new Float32Array(FRUSTUM_FLOATS);
  private readonly _shadowFrustum = new Frustum();
  private readonly _shadowViewProjection = new Matrix4();
  /**
   * Saída do gate, reusada entre frames: o veredito é lido por frame e alocar
   * um vetor a cada um devolveria em GC o que o marco quer ganhar.
   */
  private readonly _gateOut = new Float64Array(GATE_OUT_FLOATS);
  /** `true` depois de um estouro de capacidade — o espelho foi desligado. */
  private _overflowed = false;
  /**
   * Buffers do append, reaproveitados entre eventos: um *hazard* que nasce a
   * cada tiro não pode alocar um par de arrays por vez.
   */
  private _loteDescricao = new Float32Array(0);
  private _loteIndices = new Int32Array(0);


  /**
   * O espelho desligou-se por estouro de capacidade.
   *
   * Não é estado normal: é a saída de emergência que devolve o passe ao
   * `three` em vez de deixar o C++ desenhar por cima de memória que já não
   * descreve a cena (ver {@link _invalidarTudo}).
   */
  get overflowed(): boolean {
    return this._overflowed;
  }

  /**
   * Espelha a cena e passa a mandar no `matrixWorld` dela.
   *
   * A ordem é **pai antes de filho** (travessia em largura), que é o contrato
   * do lado C++ — ele recusa a árvore fora de ordem em vez de produzir matriz
   * errada em silêncio.
   */
  install(scene: Object3D): boolean {
    const api = this._bridge;
    if (!api || this._installed) return false;

    this._nodes = [];
    this._geracao++;
    const fila: Object3D[] = [scene];
    const indicePorObjeto = this._indicePorObjeto;
    indicePorObjeto.clear();
    while (fila.length > 0) {
      const objeto = fila.shift() as Object3D;
      indicePorObjeto.set(objeto, this._nodes.length);
      this._nodes.push(objeto);
      for (const filho of objeto.children) fila.push(filho);
    }

    const descricao = new Float32Array(this._nodes.length * BUILD_FLOATS_PER_NODE);
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i]!;
      const pai = objeto.parent;
      const paiIndice = pai && indicePorObjeto.has(pai) ? (indicePorObjeto.get(pai) as number) : -1;
      descreverNo(objeto, paiIndice, descricao, i * BUILD_FLOATS_PER_NODE);
    }

    if (!api.build(descricao)) {
      debug('perf', '[sceneMirror] o host recusou a arvore (fora de ordem?)');
      return false;
    }

    const matrizes = api.worldMatrices();
    this._sync = api.syncBuffer();
    if (!matrizes || !this._sync) {
      debug('perf', '[sceneMirror] host sem buffers externos');
      return false;
    }

    this._reservarPorSlot(matrizes.length / MATRIX_ELEMENTS);
    // O ponto do desenho: o `elements` de cada objeto passa a SER a fatia da
    // memória nativa. O `three` só indexa `elements`, então ele lê a matriz que
    // o C++ escreveu — sem cópia e sem laço por frame.
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i]!;
      // O tipo do `three` promete uma tupla de 16 números; o que entra é um
      // `Float64Array` do mesmo tamanho, que ele indexa igual. Tem de ser
      // DUPLA: com `Float32Array`, na escala de uma cidade (centenas de metros),
      // a matriz perde dígitos suficientes para o shadow map sair em bandas —
      // foi exatamente o que apareceu na pista na primeira versão desta fase.
      objeto.matrixWorld.elements = matrizes.subarray(
        i * MATRIX_ELEMENTS,
        i * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
      ) as unknown as Matrix4['elements'];
      // Sem isto o `three` recalcularia por cima e o ganho sumiria em silêncio.
      objeto.matrixWorldAutoUpdate = false;
      this._escutar(objeto);
      this._rastrearInstancias(objeto);
      this._adotar(objeto, i);
    }

    this._matrizes = matrizes;
    this._liveCount = this._nodes.length;
    this._installed = true;
    espelhoInstalado = this;
    debug('perf', `[sceneMirror] ${this._nodes.length} nos espelhados no host`);
    return true;
  }

  // ── A cena que muda depois do `install` (SPEC-0245, E6) ──────────────────
  //
  // Contar nós não resolve: a contagem roda na travessia amortizada de 10
  // frames (`cullShadowCasters`), e nesses 10 frames um nó novo com
  // `castShadow` autorado — o projétil do kart — seria aceito sem estar no
  // espelho. Promover a travessia a por-frame é percorrer ~1.300 nós, que é o
  // custo que este marco existe para eliminar.
  //
  // O `three` dispara `childadded`/`childremoved` no PAI, e o `dispatchEvent`
  // sai cedo quando não há listener — custo zero para quem não escuta.
  // Escutando nos nós espelhados, o espelho sabe da mutação NO FRAME em que
  // ela acontece, O(1) por evento. Todos os caminhos do `three` passam por
  // `add`/`remove`: `attach`, `clear`, `removeFromParent` e `copy` chamam um
  // dos dois, e ninguém mexe em `children` por fora (conferido no fonte).

  /** Liga os dois eventos num nó espelhado. */
  private _escutar(objeto: Object3D): void {
    objeto.addEventListener('childadded', this._aoAdicionar);
    objeto.addEventListener('childremoved', this._aoRemover);
  }

  /** Desliga os dois eventos de um nó que saiu do espelho. */
  private _pararDeEscutar(objeto: Object3D): void {
    objeto.removeEventListener('childadded', this._aoAdicionar);
    objeto.removeEventListener('childremoved', this._aoRemover);
  }

  private readonly _aoAdicionar = (evento: { target?: unknown; child?: unknown }): void => {
    const pai = evento.target as Object3D | undefined;
    const filho = evento.child as Object3D | undefined;
    if (!this._installed || !pai || !filho) return;
    const paiIndice = this._indicePorObjeto.get(pai);
    if (paiIndice === undefined) return;
    try {
      this.appendSubtree(filho, paiIndice);
    } catch (erro) {
      // O evento roda DENTRO do `add()` de quem quer que tenha mexido na cena
      // (às vezes o próprio `three`, no CSM). Deixar a exceção subir mataria o
      // frame no meio de código alheio, então aqui ela vira desligamento do
      // espelho — que já aconteceu no `appendSubtree` — mais o relato.
      debug('perf', `[sceneMirror] append recusado no evento: ${String(erro)}`);
    }
  };

  private readonly _aoRemover = (evento: { child?: unknown }): void => {
    const filho = evento.child as Object3D | undefined;
    if (!this._installed || !filho) return;
    this.removeSubtree(filho);
  };

  /**
   * Põe no espelho uma subárvore que a cena acabou de ganhar.
   *
   * A subárvore inteira atravessa a ponte numa chamada só: uma travessia por
   * evento, não uma por nó (15 us cada, SPEC-0225).
   *
   * @throws quando o host recusa o append. Estouro de capacidade **não**
   *   realoca do lado C++ — realocar deixaria todo `matrixWorld.elements` já
   *   entregue sobre memória liberada (SPEC-0234). Antes de lançar, este
   *   método invalida os `elements` e devolve o passe ao `three`.
   */
  appendSubtree(raiz: Object3D, paiIndice: number): void {
    const api = this._bridge;
    if (!api?.appendNodes || !this._installed) return;

    // Pai antes de filho, como no `install`: é o contrato do lado C++.
    const novos: Object3D[] = [];
    const paiDoNovo: number[] = [];
    const fila: { objeto: Object3D; pai: number }[] = [{ objeto: raiz, pai: paiIndice }];
    while (fila.length > 0) {
      const { objeto, pai } = fila.shift() as { objeto: Object3D; pai: number };
      if (this._indicePorObjeto.has(objeto)) {
        // Já espelhado: não há caminho normal que leve aqui (uma troca de pai
        // remove antes de acrescentar), e mapear o mesmo objeto duas vezes
        // deixaria o espelho mentindo. Desliga em vez de seguir.
        this._invalidarTudo('no ja espelhado chegou como novo');
        throw new Error('[sceneMirror] no ja espelhado chegou no childadded');
      }
      const posicao = novos.length;
      novos.push(objeto);
      paiDoNovo.push(pai);
      for (const filho of objeto.children) {
        fila.push({ objeto: filho, pai: BATCH_PARENT_BASE - posicao });
      }
    }

    if (this._loteDescricao.length < novos.length * BUILD_FLOATS_PER_NODE) {
      this._loteDescricao = new Float32Array(novos.length * BUILD_FLOATS_PER_NODE);
      this._loteIndices = new Int32Array(novos.length);
    }
    const descricao = this._loteDescricao.subarray(0, novos.length * BUILD_FLOATS_PER_NODE);
    for (let i = 0; i < novos.length; i++) {
      descreverNo(novos[i]!, paiDoNovo[i]!, descricao, i * BUILD_FLOATS_PER_NODE);
    }

    const entraram = api.appendNodes(descricao, this._loteIndices);
    if (entraram !== novos.length) {
      const motivo =
        entraram === APPEND_ERROR_CAPACITY ? 'capacidade esgotada' : `codigo ${entraram}`;
      this._invalidarTudo(motivo);
      throw new Error(`[sceneMirror] append de ${novos.length} nos recusado: ${motivo}`);
    }

    const matrizes = this._matrizes;
    for (let i = 0; i < novos.length; i++) {
      const objeto = novos[i]!;
      const indice = this._loteIndices[i]!;
      this._nodes[indice] = objeto;
      this._indicePorObjeto.set(objeto, indice);
      if (matrizes) {
        objeto.matrixWorld.elements = matrizes.subarray(
          indice * MATRIX_ELEMENTS,
          indice * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
        ) as unknown as Matrix4['elements'];
      }
      objeto.matrixWorldAutoUpdate = false;
      this._escutar(objeto);
      const malha = objeto as NoDaCena;
      if (malha.isMesh && malha.geometry) this._geometriasNovas.add(malha.geometry);
      this._rastrearInstancias(objeto);
      // O host já tem o estado do nó pela descrição: nasce limpo.
      this._adotar(objeto, indice);
    }
    this._liveCount += novos.length;
  }

  /**
   * Tira do espelho uma subárvore que saiu da cena.
   *
   * O slot vira lápide NO LUGAR, do lado C++: mudar o índice dos outros
   * obrigaria a reapontar o `matrixWorld` de todos, que é o laço em JS que a
   * SPEC-0234 eliminou. O objeto que sai recebe de volta um `elements` próprio
   * (com a última matriz que tinha) e o `matrixWorldAutoUpdate`, porque o slot
   * pode ser reaproveitado por outro nó — é o caso do pool de *hazards*.
   */
  removeSubtree(raiz: Object3D): void {
    const api = this._bridge;
    if (!this._installed) return;
    const indice = this._indicePorObjeto.get(raiz);
    if (indice === undefined) return;

    api?.removeNode?.(indice);
    const matrizes = this._matrizes;
    raiz.traverse((objeto) => {
      const slot = this._indicePorObjeto.get(objeto);
      if (slot === undefined) return;
      this._indicePorObjeto.delete(objeto);
      this._instanciados.delete(objeto as NoDaCena);
      this._recorteAlfa.delete(objeto);
      this._nodes[slot] = undefined;
      this._liveCount--;
      this._pararDeEscutar(objeto);
      desengancharNo(objeto);
      if (matrizes) {
        objeto.matrixWorld.elements = matrizes.slice(
          slot * MATRIX_ELEMENTS,
          slot * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
        ) as unknown as Matrix4['elements'];
      }
      objeto.matrixWorldAutoUpdate = true;
    });
  }

  /**
   * Desliga o espelho e devolve TODO `matrixWorld` ao `three`.
   *
   * É a saída de emergência de quando o espelho deixa de descrever a cena
   * (estouro de capacidade). Recusar assumir custa os milissegundos do marco;
   * seguir com um espelho errado custaria a imagem — e o erro apareceria como
   * artefato visual, não como exceção (SPEC-0234).
   */
  private _invalidarTudo(motivo: string): void {
    const matrizes = this._matrizes;
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i];
      if (!objeto) continue;
      this._pararDeEscutar(objeto);
      desengancharNo(objeto);
      if (matrizes) {
        objeto.matrixWorld.elements = matrizes.slice(
          i * MATRIX_ELEMENTS,
          i * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
        ) as unknown as Matrix4['elements'];
      }
      objeto.matrixWorldAutoUpdate = true;
    }
    this._nodes = [];
    this._indicePorObjeto.clear();
    this._instanciados.clear();
    this._recorteAlfa.clear();
    this._liveCount = 0;
    this._qtdSujos = 0;
    this._installed = false;
    this._overflowed = true;
    if (espelhoInstalado === this) espelhoInstalado = undefined;
    debug('perf', `[sceneMirror] DESLIGADO: ${motivo}`);
  }

  /**
   * Manda ao host o que mudou e recebe a cena atualizada — **uma** travessia de
   * ponte por frame.
   */
  update(camera: Camera): void {
    const api = this._bridge;
    const sync = this._sync;
    if (!api || !sync || !this._installed) return;

    // Só os nós SUJOS viram linha (SPEC-0322). Transform suja pelo gancho, no
    // instante da escrita; as flags do quadro (`visible`, `material.visible`,
    // lado da sombra — todas reavaliadas pelo `three` a cada travessia, e
    // fotografá-las no `build` foi o erro que já virou sombra errada 3×,
    // SPEC-0245) são conferidas por varredura em rodízio, que suja o slot
    // quando divergem do que o host tem.
    this._varrerFlags();
    const linhas = this._escreverLinhas();
    this._sincronizadosNoQuadro = linhas;
    this._somaSincronizados += linhas;
    this._quadrosSomados++;

    camera.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection);
    escreverPlanos(this._frustum, this._planes);

    api.update(linhas, this._planes);
    this._sincronizarInstancias(api);
  }

  /**
   * Desenha o passe de sombra da cascata em C++ (SPEC-0245, E5 do passo 2).
   *
   * Uma travessia de ponte faz o que o `three` faz em JS por objeto: enumera
   * os casters, passa pelo gate e, se ele deixar, desenha direto na
   * `ShadowDepthTexture`.
   *
   * Tem de rodar DEPOIS de {@link update} — o C++ lê as matrizes de mundo que
   * ele acabou de compor — e com a ortho da cascata já fixada por
   * `shadow.updateMatrices(luz)`: o `three` só a fixa dentro do `renderShadow`,
   * e enumerar antes usaria o frustum do frame passado. E porque, sem o
   * `updateMatrices`, o uniforme
   * `lightShadowMatrix` que o `three` usa para AMOSTRAR o mapa congela, e a
   * sombra fica presa ao mundo de um frame antigo.
   *
   * @param alvo - O `GPUTexture` de `shadow.map.depthTexture`, obtido por
   *   IDENTIDADE do objeto (`backend.get(...)`) e reaquirido por frame: o
   *   `three` recria a textura quando o `mapSize` muda.
   * @param viewProjection - `projectionMatrix × matrixWorldInverse` da ortho da
   *   cascata, em `Float64Array`. **Nunca `Float32Array`**: a multiplicação
   *   por `model` acontece em `double` no C++, e degradar antes é o caminho
   *   conhecido para as bandas da SPEC-0234.
   * @returns `{ drawn }` quando desenhou, `{ refused }` com o motivo quando
   *   não — e `undefined` no browser/Studio, onde não há host.
   */
  drawShadowPass(
    shadowCamera: Camera,
    cameraPosition: Vector3,
    minRatio: number,
    viewProjection: Float64Array,
    alvo: unknown,
    sceneNodeCount: number,
    vsmShadowMap: boolean,
  ): ShadowPassOutcome | undefined {
    const api = this._bridge;
    if (!api?.drawShadowPass || !this._installed) return undefined;

    this._escreverPlanosDaCascata(shadowCamera);
    const resposta = api.drawShadowPass(
      minRatio,
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      this._shadowPlanes,
      viewProjection,
      alvo ?? null,
      sceneNodeCount,
      vsmShadowMap,
      this._gateOut,
    );
    if (typeof resposta !== 'number') return undefined;

    const totalCasters = this._gateOut[GATE_OUT_TOTAL_CASTERS] ?? 0;
    if (resposta < 0) {
      const reason = SHADOW_GATE_REASONS[-resposta] ?? 'geometria-ausente';
      // Host antigo não escreve o slot (fica 0, que é a cena): só confia em >0.
      const ofensor = this._gateOut[GATE_OUT_FIRST_OFFENDER] ?? -1;
      const offender = ofensor > 0 ? this._nodes[ofensor] : undefined;
      const partes: string[] = [];
      for (let i = 1; i < SHADOW_GATE_REASONS.length; i++) {
        const n = this._gateOut[i] ?? 0;
        if (n > 0) partes.push(`${SHADOW_GATE_REASONS[i]}=${n}`);
      }
      return { drawn: 0, refused: true, reason, totalCasters, offender, counts: partes.join(' ') };
    }
    return { drawn: resposta, refused: false, reason: 'aceito', totalCasters };
  }

  /**
   * Deriva os planos da ortho da CASCATA em `_shadowPlanes`.
   *
   * O sistema de coordenadas VEM DA CÂMERA, como no `_projectObject`: em
   * WebGPU o NDC em z vai de 0 a 1, e derivar os planos pela convenção do
   * WebGL daria um near/far deslocado — casters cortados que o `three`
   * desenha, ou o contrário.
   */
  private _escreverPlanosDaCascata(shadowCamera: Camera): void {
    shadowCamera.updateMatrixWorld();
    this._shadowViewProjection.multiplyMatrices(
      shadowCamera.projectionMatrix,
      shadowCamera.matrixWorldInverse,
    );
    const comCoordenadas = shadowCamera as Camera & {
      coordinateSystem?: number;
      reversedDepth?: boolean;
    };
    this._shadowFrustum.setFromProjectionMatrix(
      this._shadowViewProjection,
      comCoordenadas.coordinateSystem,
      comCoordenadas.reversedDepth,
    );
    escreverPlanos(this._shadowFrustum, this._shadowPlanes);
  }
}
