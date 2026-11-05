/**
 * Registro de geometria dos casters de sombra (SPEC-0245, E2 do passo 2; ADR-0692).
 *
 * O passe de sombra nativo precisa da geometria de **todos** os casters: uma
 * que falte não é um objeto a menos na tabela, é uma **sombra faltando** na
 * imagem — e é por isso que o gate (E3) recusa o frame enquanto houver
 * geometria ausente.
 *
 * Quatro cuidados, cada um pago por um modo de falha conhecido:
 *
 * 1. **Os `GPUBuffer` vêm de um provedor** ({@link ShadowGeometrySource}): com o
 *    NativeRenderer, o buffer do store nativo, depois o do backend do `three`,
 *    e por fim um upload pelo store nativo (só `position` + índice), que o
 *    desenho principal reaproveita depois. Sem NativeRenderer, só o `three` —
 *    e aí uma malha que ainda não foi desenhada não tem buffer nenhum, então o
 *    registro segue PREGUIÇOSO: quem não deu certo fica na fila de pendentes e
 *    é tentado de novo nos frames seguintes.
 * 2. **Orçamento de upload.** A varredura inicial sobe no máximo
 *    {@link SHADOW_UPLOAD_BYTES_PER_FRAME} por quadro (o aquecimento leva alguns
 *    segundos, sem um quadro de 100 ms). A geometria nova drenada do espelho
 *    (LOD, streaming) sobe no MESMO quadro, fora do orçamento: senão cada
 *    objeto novo daria um quadro de luz plena.
 * 3. **Invalidação.** O `dispose` da `BufferGeometry` desregistra (o `destroy`
 *    de buffer do host é ADIADO em 10 frames, ADR-0153). Quando o provedor
 *    avisa que o buffer de uma fonte foi refeito (array trocado), o mesmo id é
 *    registrado de novo com o handle novo. A geometria recusada pelo provedor
 *    também ouve o `dispose`: sai da contagem e do registro do host.
 * 4. **Nada aqui é dono de buffer.** O host faz `AddRef` do que guarda
 *    (ADR-0692, item 5); este módulo só guarda o vínculo id → buffers.
 */
import type * as THREE from 'three';
import { debug } from '../core/debug.js';
import { geometryId, type GeometryBuffers } from './GeometryDesc.js';
import {
  POSITION_FORMAT_REFUSAL, shadowSourceFor, type ShadowGeometrySource, type ShadowSourceBackend,
} from './ShadowGeometrySource.js';

/** Bytes de 1 MiB. */
const BYTES_POR_MIB = 1024 * 1024;
/** Teto de bytes que a varredura sobe por quadro (ADR-0692, item 3). */
export const SHADOW_UPLOAD_BYTES_PER_FRAME = 2 * BYTES_POR_MIB;
/**
 * Pesos que juntam os três contadores do relato num número só, exato em double: recusadas e pendentes abaixo de
 * 2^17, registradas abaixo de 2^19 (a cidade inteira tem poucos milhares de geometrias).
 */
const CHAVE_PENDENTES = 2 ** 17;
const CHAVE_REGISTRADAS = 2 ** 34;

/** A parte do `__cortexGeometryRegistry` que este módulo usa. */
interface PonteDoRegistro {
  register(
    id: number,
    vertexBuffer: unknown,
    indexBuffer: unknown,
    indexCount: number,
    vertexCount: number,
    indexIs32Bit: boolean,
    vertexStride: number,
    vertexOffset: number,
    /** Opcional (ADR-0692): `false` marca o id para o gate recusar com `posicao-nao-float32x3`. */
    positionIsFloat32x3?: boolean,
  ): boolean;
  unregister(id: number): void;
  size(): number;
}

/** Uma `BufferGeometry` que avisa quando é descartada. */
type GeometriaComEventos = THREE.BufferGeometry & {
  addEventListener?(tipo: string, ouvinte: (evento: { target?: unknown }) => void): void;
  removeEventListener?(tipo: string, ouvinte: (evento: { target?: unknown }) => void): void;
};

function ponte(): PonteDoRegistro | null {
  return (
    (globalThis as { __cortexGeometryRegistry?: PonteDoRegistro }).__cortexGeometryRegistry ?? null
  );
}

/** As fontes de buffer da geometria que o registro usa: o dono da `position` e o índice. */
function fontesDe(geometria: THREE.BufferGeometry): object[] {
  const posicao = geometria.getAttribute?.('position') as
    | { isInterleavedBufferAttribute?: boolean; data?: object }
    | undefined;
  const fontes: object[] = [];
  const dono = posicao?.isInterleavedBufferAttribute === true ? posicao.data : posicao;
  if (dono) fontes.push(dono);
  if (geometria.index) fontes.push(geometria.index);
  return fontes;
}

/** Uma chamada à ponte com os campos na ordem dela. */
function registrar(api: PonteDoRegistro, id: number, b: GeometryBuffers): boolean {
  return api.register(
    id, b.vertexBuffer, b.indexBuffer, b.indexCount, b.vertexCount, b.indexIs32Bit, b.vertexStride, b.vertexOffset,
  );
}

/** Sem buffer nem contagem: só o 9º argumento importa (`positionIsFloat32x3 = false`). */
function marcarFormatoRecusado(api: PonteDoRegistro, id: number): void {
  api.register(id, null, null, 0, 0, false, 0, 0, false);
}

/** O que a última passada de {@link CasterGeometryRegistry.atualizar} fez. */
export interface RegistroDeCasters {
  /** Geometrias distintas registradas até agora. */
  registradas: number;
  /** Geometrias que ainda não tinham buffer e serão tentadas de novo. */
  pendentes: number;
}

/**
 * Mantém o registro de geometria em dia para os casters da cena.
 *
 * Guarda o estado entre frames de propósito: a varredura da cena roda UMA vez
 * e, a partir daí, o trabalho por frame é proporcional ao que ainda falta —
 * zero quando tudo entrou, que é o regime normal depois do aquecimento.
 */
export class CasterGeometryRegistry {
  /** Geometrias ainda sem buffer. `null` = a cena nem foi varrida. */
  private _pendentes: Set<THREE.BufferGeometry> | null = null;
  /** id → remover o ouvinte de `dispose`, para não vazar o ouvinte. */
  private readonly _registradas = new Map<number, () => void>();
  /** Recusa permanente do provedor (formato), para o relato dizer POR QUE falta. */
  private _recusadas = new WeakMap<THREE.BufferGeometry, string>();
  private _totalRecusadas = 0;
  /** id → remover o ouvinte de `dispose` da recusada pelo provedor. */
  private readonly _ouvintesDeRecusa = new Map<number, () => void>();
  /** Fonte de buffer → geometrias registradas que a usam (re-registro na troca). */
  private _porFonte = new WeakMap<object, Set<THREE.BufferGeometry>>();
  /** O provedor do último quadro e o `off` do ouvinte de troca de buffer dele. */
  private _fonte: ShadowGeometrySource | null = null;
  private _desouvir: (() => void) | null = null;
  /**
   * Tira da fila a geometria descartada ANTES do upload (despejo de cache do
   * streaming): ela nunca ganharia buffer, e ficar na fila prenderia os arrays
   * de CPU dela para sempre (SPEC-0289). Um ouvinte só, compartilhado — o
   * `EventDispatcher` do `three` não duplica o mesmo ouvinte.
   */
  private readonly _aoDescartarPendente = (evento: { target?: unknown }): void => {
    const geometria = evento.target as GeometriaComEventos;
    this._pendentes?.delete(geometria);
    geometria.removeEventListener?.('dispose', this._aoDescartarPendente);
    this._fonte?.forget?.(geometria);
  };
  /** Números (e provedor) do último relato, para não repetir a mesma linha todo frame. */
  private _ultimoRelato = -1;
  private _fonteRelatada: ShadowGeometrySource | null = null;

  /** Geometrias distintas registradas. */
  get total(): number {
    return this._registradas.size;
  }

  /** Geometrias que ainda esperam buffer. */
  get pendentes(): number {
    return this._pendentes?.size ?? 0;
  }

  /** Geometrias que o provedor recusou de vez (formato fora do que o passe desenha). */
  get recusadas(): number {
    return this._totalRecusadas;
  }

  /** Uma linha curta do estado, para o relato de recusa do passe (`[shadowPass]`). */
  get resumo(): string {
    return `registradas=${this._registradas.size} pendentes=${this.pendentes} recusadas=${this._totalRecusadas} fonte=${this._fonte?.kind ?? '-'}`;
  }

  /**
   * Tenta registrar o que falta. Barato quando não falta nada.
   *
   * @param cena - A cena a varrer (só na primeira chamada).
   * @param backend - O backend do `three` (`renderer.backend`), usado quando não há `fonte`.
   * @param novas - Geometrias de malhas que entraram na cena depois da
   *   varredura (o espelho as entrega, ver `drainNewGeometries`). Sem elas o
   *   registro só conheceria a cena do primeiro frame, e todo LOD carregado
   *   pelo streaming recusaria o passe nativo para sempre (SPEC-0289).
   * @param fonte - O provedor dos buffers (ADR-0692); o padrão é o do quadro ({@link shadowSourceFor}).
   */
  atualizar(
    cena: THREE.Object3D,
    backend: ShadowSourceBackend,
    novas: Iterable<THREE.BufferGeometry> = [],
    fonte: ShadowGeometrySource = shadowSourceFor(backend),
  ): RegistroDeCasters {
    const api = ponte();
    if (!api) return { registradas: 0, pendentes: 0 };
    this._ouvir(fonte);
    // As cópias que só a sombra usa seguem a `version`, a troca de array e a cópia do `three` (ADR-0692).
    fonte.refresh?.();

    if (this._pendentes === null) {
      this._pendentes = new Set();
      for (const geometria of this._varrer(cena)) this._enfileirar(geometria);
    }
    for (const geometria of novas) {
      // A já registrada não volta para a fila; a que foi descartada (TTL do
      // cache) saiu de `_registradas` no `dispose` e entra de novo aqui.
      if (this._registradas.has(geometryId(geometria))) continue;
      // Sobe no mesmo quadro, fora do orçamento (ADR-0692, item 3).
      if (this._tentar(api, fonte, geometria, true)) this._resolver(geometria);
      else this._enfileirar(geometria);
    }

    // Remover do `Set` durante a iteração é seguro e não copia nada por frame.
    let gasto = 0;
    for (const geometria of this._pendentes) {
      const antes = fonte.uploadedBytes;
      // Sem buffer ainda: fica pendente — e é o gate que impede o passe de
      // assumir enquanto isso. Esgotado o orçamento, só entra o que já tem buffer.
      if (this._tentar(api, fonte, geometria, gasto < SHADOW_UPLOAD_BYTES_PER_FRAME)) this._resolver(geometria);
      gasto += fonte.uploadedBytes - antes;
    }

    this._relatar();
    return { registradas: this._registradas.size, pendentes: this._pendentes.size };
  }

  /**
   * Onde a geometria está no registro — para o relato de recusa dizer POR QUE
   * ela falta (SPEC-0289): `pendente` espera buffer; `desconhecida` nunca
   * entrou na fila; outro texto é a recusa do provedor (`posicao-nao-float32x3`).
   */
  estado(geometria: THREE.BufferGeometry): string {
    if (this._registradas.has(geometryId(geometria))) return 'registrada';
    if (this._pendentes?.has(geometria)) return 'pendente';
    return this._recusadas.get(geometria) ?? 'desconhecida';
  }

  /** Esquece tudo (troca de cena). Não libera buffer nenhum — não são nossos. */
  limpar(): void {
    for (const remover of this._registradas.values()) remover();
    this._registradas.clear();
    for (const remover of this._ouvintesDeRecusa.values()) remover();
    this._ouvintesDeRecusa.clear();
    for (const geometria of this._pendentes ?? []) {
      (geometria as GeometriaComEventos).removeEventListener?.('dispose', this._aoDescartarPendente);
    }
    this._pendentes = null;
    this._recusadas = new WeakMap();
    this._totalRecusadas = 0;
    this._porFonte = new WeakMap();
    this._ultimoRelato = -1;
  }

  /**
   * Fim do passe (troca de cena, rebuild da iluminação): solta o ouvinte de troca de buffer do provedor, que vive
   * tanto quanto o NativeRenderer, e esquece tudo. Sem isto o provedor prenderia este registro (e as geometrias da
   * cena velha), e uma troca de buffer posterior mexeria no registro GLOBAL do host com os ids daqui.
   */
  dispose(): void {
    this._desouvir?.();
    this._desouvir = null;
    this._fonte = null;
    this._fonteRelatada = null;
    this.limpar();
  }

  /**
   * Pede os buffers ao provedor e registra. `true` = resolvida (registrada,
   * recusada pelo host ou recusada de vez pelo provedor); `false` = fica pendente.
   */
  private _tentar(
    api: PonteDoRegistro,
    fonte: ShadowGeometrySource,
    geometria: THREE.BufferGeometry,
    subir: boolean,
  ): boolean {
    const buffers = fonte.buffers(geometria, subir);
    if (buffers === null) return false;
    if (typeof buffers === 'string') {
      if (!this._recusadas.has(geometria)) {
        this._totalRecusadas++;
        this._ouvirDescarteDaRecusada(api, geometryId(geometria), geometria);
      }
      this._recusadas.set(geometria, buffers);
      // O host marca o id, e o gate recusa com o motivo certo em vez de `geometria-ausente`.
      if (buffers === POSITION_FORMAT_REFUSAL) marcarFormatoRecusado(api, geometryId(geometria));
      return true;
    }
    const id = geometryId(geometria);
    // Recusado pelo host (entrada sem nada a desenhar): sai da fila do mesmo
    // jeito. Insistir todo frame numa geometria que o registro rejeita seria
    // trabalho puro, e o gate já recusa o frame por geometria ausente.
    if (registrar(api, id, buffers)) this._registrar(api, id, geometria);
    return true;
  }

  /** A recusada descartada sai da contagem e do registro do host (senão o `positionRefused_` do C++ só cresce). */
  private _ouvirDescarteDaRecusada(api: PonteDoRegistro, id: number, geometria: THREE.BufferGeometry): void {
    const comEventos = geometria as GeometriaComEventos;
    const aoDescartar = (): void => {
      comEventos.removeEventListener?.('dispose', aoDescartar);
      this._ouvintesDeRecusa.delete(id);
      if (this._recusadas.delete(geometria)) this._totalRecusadas--;
      api.unregister(id);
    };
    comEventos.addEventListener?.('dispose', aoDescartar);
    this._ouvintesDeRecusa.set(id, () => comEventos.removeEventListener?.('dispose', aoDescartar));
  }

  /** Tira da fila de pendentes e para de ouvir o descarte de pendente. */
  private _resolver(geometria: THREE.BufferGeometry): void {
    this._pendentes?.delete(geometria);
    (geometria as GeometriaComEventos).removeEventListener?.('dispose', this._aoDescartarPendente);
  }

  /** Passa a ouvir a troca de buffer do provedor do quadro (um ouvinte só). */
  private _ouvir(fonte: ShadowGeometrySource): void {
    if (fonte === this._fonte) return;
    this._desouvir?.();
    this._fonte = fonte;
    this._desouvir = fonte.onBufferReplaced?.(this._aoTrocarBuffer) ?? null;
  }

  /**
   * O buffer de uma fonte foi refeito (array trocado): o handle registrado
   * ficou velho. Registra o mesmo id de novo com o novo; sem como, desregistra
   * e põe na fila (o gate recusa até lá, em vez de desenhar com o buffer velho).
   */
  private readonly _aoTrocarBuffer = (fonteDoBuffer: object): void => {
    const geometrias = this._porFonte.get(fonteDoBuffer);
    const api = ponte();
    const fonte = this._fonte;
    if (!geometrias || !api || !fonte) return;
    for (const geometria of [...geometrias]) {
      const id = geometryId(geometria);
      if (!this._registradas.has(id)) continue;
      const buffers = fonte.buffers(geometria, true);
      if (buffers !== null && typeof buffers !== 'string' && registrar(api, id, buffers)) continue;
      api.unregister(id);
      this._esquecer(id, geometria);
      this._enfileirar(geometria);
    }
  };

  /**
   * Geometrias distintas dos nós que podem virar caster.
   *
   * Vai por geometria, e não por malha: as quatro rodas de um carro
   * compartilham a mesma `BufferGeometry` e recebem o mesmo id — registrar por
   * malha repetiria o mesmo registro quatro vezes.
   *
   * O filtro é DELIBERADAMENTE largo (qualquer malha com geometria, sem olhar
   * `castShadow`): o filtro angular da SPEC-0197 liga e desliga `castShadow` a
   * cada 10 frames, então restringir aqui deixaria de fora justamente a malha
   * que volta a projetar no frame seguinte — e ela voltaria SEM registro.
   */
  private _varrer(cena: THREE.Object3D): Set<THREE.BufferGeometry> {
    const vistas = new Set<THREE.BufferGeometry>();
    cena.traverse((objeto) => {
      const malha = objeto as THREE.Mesh;
      if (malha.isMesh && malha.geometry) vistas.add(malha.geometry);
    });
    return vistas;
  }

  /** Põe na fila de pendentes e passa a ouvir o descarte antes do upload. */
  private _enfileirar(geometria: THREE.BufferGeometry): void {
    this._pendentes?.add(geometria);
    (geometria as GeometriaComEventos).addEventListener?.('dispose', this._aoDescartarPendente);
  }

  /** Guarda o vínculo, as fontes de buffer dela e passa a ouvir o descarte da geometria. */
  private _registrar(api: PonteDoRegistro, id: number, geometria: THREE.BufferGeometry): void {
    if (this._registradas.has(id)) return;
    const comEventos = geometria as GeometriaComEventos;
    const aoDescartar = (): void => {
      api.unregister(id);
      this._esquecer(id, geometria);
      this._fonte?.forget?.(geometria);
    };
    comEventos.addEventListener?.('dispose', aoDescartar);
    this._registradas.set(id, () => {
      comEventos.removeEventListener?.('dispose', aoDescartar);
    });
    for (const fonte of fontesDe(geometria)) {
      let geometrias = this._porFonte.get(fonte);
      if (!geometrias) this._porFonte.set(fonte, (geometrias = new Set()));
      geometrias.add(geometria);
    }
  }

  /** Larga o vínculo de um id (o ouvinte de `dispose` e as fontes). */
  private _esquecer(id: number, geometria: THREE.BufferGeometry): void {
    this._registradas.get(id)?.();
    this._registradas.delete(id);
    for (const fonte of fontesDe(geometria)) this._porFonte.get(fonte)?.delete(geometria);
  }

  /**
   * Relata só quando um número muda — senão seriam 60 linhas iguais por segundo. Compara os números, não a
   * linha: montar a string todo quadro já seria uma alocação por quadro no Hermes.
   */
  private _relatar(): void {
    const chave = this._registradas.size * CHAVE_REGISTRADAS + this.pendentes * CHAVE_PENDENTES + this._totalRecusadas;
    if (chave === this._ultimoRelato && this._fonte === this._fonteRelatada) return;
    this._ultimoRelato = chave;
    this._fonteRelatada = this._fonte;
    debug('perf', `[casterGeometry] ${this.resumo}`);
  }
}
