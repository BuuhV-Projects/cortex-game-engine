/**
 * Recorte alfa dos casters no passe de sombra nativo (SPEC-0642).
 *
 * O `three` recorta a sombra de um material com `alphaTest` pela textura: amostra
 * `map.a` no UV transformado por `map.matrix` e descarta o fragmento quando
 * `a <= alphaTest`. Este módulo entrega ao host o que ele precisa para fazer o
 * mesmo — o `GPUTexture` do `map`, o `GPUBuffer` do atributo `uv`, o passo e o
 * deslocamento do UV, o `alphaTest`, o wrap e a matriz — para cada nó do espelho
 * marcado com recorte.
 *
 * O UV e a textura vêm do provedor do passe de sombra (ADR-0692): com o
 * NativeRenderer, o slot do store nativo que carrega o `uv` (passo e
 * deslocamento dele) e a textura subida pelo mesmo caminho do material nativo;
 * sem ele, os handles do backend do `three`, como antes.
 *
 * Só atravessa a ponte quando algo mudou: no regime normal o trabalho por quadro
 * é comparar meia dúzia de campos por nó com recorte, sem alocar. O nó que sai do
 * espelho (`removeSubtree`) é esquecido aqui: o host apagou o slot dele, e quem
 * volta ao MESMO slot precisa mandar o `set` de novo.
 *
 * O que o host não sabe reproduzir (`alphaMap`, `colorNode`, máscaras, UV em outro
 * canal ou quantizado) NÃO é registrado — o gate segue recusando o quadro, e o
 * `three` desenha a sombra como sempre. Recusar em vez de aproximar.
 */
import type { Object3D } from 'three';
import { debug } from '../core/debug.js';
import { shadowSourceFor, type ShadowGeometrySource, type ShadowUvSlot } from './ShadowGeometrySource.js';
import {
  guardarChave,
  guardarRecusa,
  mesmaChave,
  mesmaRecusa,
  novaChave,
  novaChaveDaRecusa,
  type Chave,
  type ChaveDaRecusa,
  type MaterialDoRecorte,
  type ObjetoDoRecorte,
} from './shadowAlphaClipKeys.js';

/** A ponte `__cortexShadowAlphaClip` do host (`shadow_alpha_clip_shim.cpp`). */
interface PonteDoRecorte {
  set(
    no: number,
    textura: unknown,
    bufferUv: unknown,
    passoUv: number,
    deslocamentoUv: number,
    alphaTest: number,
    wrapS: number,
    wrapT: number,
    uvMatrix: Float32Array,
  ): boolean;
  erase(no: number): void;
}

/** O backend do `three`, de onde saem os handles de GPU. */
export interface BackendDoRecorte {
  get(alvo: unknown): { buffer?: unknown; texture?: unknown } | undefined;
}

/** A parte do `NativeSceneMirror` que este módulo usa. */
export interface EspelhoDoRecorte {
  readonly alphaClipNodes: ReadonlySet<Object3D>;
  nodeIndex(objeto: Object3D): number | undefined;
  readonly generation: number;
  /** Avisa quando um nó com recorte sai do espelho; devolve o `off`. */
  onAlphaClipRemoved?(ouvinte: (objeto: Object3D) => void): () => void;
}

/** A parte do provedor do passe de sombra que o recorte usa. */
export type FonteDeUvETextura = Pick<ShadowGeometrySource, 'uv' | 'texture'> &
  Partial<Pick<ShadowGeometrySource, 'onBufferReplaced'>>;

/** Floats da `Matrix3` do `three`. */
const FLOATS_DA_MATRIZ_UV = 9;
/** Componentes de um UV e bytes por float. */
const COMPONENTES_DO_UV = 2;
/** Único canal de UV que o host lê (`uv`, não `uv1`…). */
const CANAL_DO_UV = 0;

/** Destino reaproveitado do slot do UV que o provedor preenche (sem alocar por nó e por quadro). */
const SLOT_DO_UV: ShadowUvSlot = { buffer: null, stride: 0, offset: 0 };

/** O que o `three` usaria no recorte de um nó, lido sem alocar. */
interface FonteDoRecorte {
  textura: unknown;
  bufferUv: unknown;
  passo: number;
  deslocamento: number;
  alphaTest: number;
  wrapS: number;
  wrapT: number;
  matriz: Float32Array;
}

/** O que já foi mandado ao host para um nó. */
interface Enviado extends FonteDoRecorte, Chave, ChaveDaRecusa {
  indice: number;
  geracao: number;
  /** Algo foi mandado (aceito ou não) — sem mudança, não manda de novo. */
  mandado: boolean;
  /** O host guardou (é o que precisa de `erase` quando a fonte some). */
  registrado: boolean;
  /** Último motivo de não registrar, para logar só quando muda. */
  motivo: string;
}

function novaFonte(): FonteDoRecorte {
  return {
    textura: null,
    bufferUv: null,
    passo: 0,
    deslocamento: 0,
    alphaTest: 0,
    wrapS: 0,
    wrapT: 0,
    matriz: new Float32Array(FLOATS_DA_MATRIZ_UV),
  };
}

type AtributoUv = {
  itemSize?: number;
  normalized?: boolean;
  array?: unknown;
  isInterleavedBufferAttribute?: boolean;
  data?: { array?: unknown };
};

/**
 * Lê em `destino` o recorte que o `three` aplicaria a `objeto`.
 *
 * @returns `null` quando o host consegue reproduzir; senão o motivo (texto curto
 *   para o log) — e aí o recorte não é registrado.
 */
export function lerFonteDoRecorte(
  objeto: Object3D,
  fonte: FonteDeUvETextura,
  destino: FonteDoRecorte,
): string | null {
  const malha = objeto as Object3D & {
    material?: MaterialDoRecorte | MaterialDoRecorte[];
    geometry?: Parameters<ShadowGeometrySource['uv']>[0];
  };
  const material = malha.material;
  if (!material || Array.isArray(material)) return 'material-em-array';
  if ((material.alphaTest ?? 0) <= 0) return 'sem-alphaTest';
  // O que entra no alfa da sombra do `three` além do `map.a` (ver `_getShadowNodes`).
  if (material.alphaMap) return 'alphaMap';
  if (material.colorNode || material.castShadowNode) return 'colorNode';
  if (material.maskNode || material.maskShadowNode) return 'maskNode';
  const mapa = material.map;
  if (!mapa) return 'sem-map';
  if ((mapa.channel ?? CANAL_DO_UV) !== CANAL_DO_UV) return 'canal-de-uv';

  const uv = (malha.geometry as { getAttribute?(nome: string): unknown } | undefined)?.getAttribute?.('uv') as AtributoUv | undefined;
  if (!uv || uv.itemSize !== COMPONENTES_DO_UV || uv.normalized) return 'uv-ausente';
  const intercalado = uv.isInterleavedBufferAttribute === true;
  const dono = intercalado ? uv.data : uv;
  if (!dono || !(dono.array instanceof Float32Array)) return 'uv-nao-float32';

  const textura = fonte.texture(mapa);
  if (!textura) return 'textura-sem-gpu';
  if (!fonte.uv(malha.geometry!, SLOT_DO_UV)) return 'uv-sem-gpu';

  // O `TextureNode` do `three` atualiza a matriz por objeto desenhado; aqui é a
  // mesma conta (`setUvTransform`), barata e sem alocar.
  if (mapa.matrixAutoUpdate) mapa.updateMatrix?.();
  const elementos = mapa.matrix.elements;
  for (let i = 0; i < FLOATS_DA_MATRIZ_UV; i++) destino.matriz[i] = elementos[i]!;
  destino.textura = textura;
  destino.bufferUv = SLOT_DO_UV.buffer;
  destino.passo = SLOT_DO_UV.stride;
  destino.deslocamento = SLOT_DO_UV.offset;
  destino.alphaTest = material.alphaTest!;
  destino.wrapS = mapa.wrapS;
  destino.wrapT = mapa.wrapT;
  return null;
}

function mesmaFonte(a: FonteDoRecorte, b: FonteDoRecorte): boolean {
  if (
    a.textura !== b.textura ||
    a.bufferUv !== b.bufferUv ||
    a.passo !== b.passo ||
    a.deslocamento !== b.deslocamento ||
    a.alphaTest !== b.alphaTest ||
    a.wrapS !== b.wrapS ||
    a.wrapT !== b.wrapT
  ) {
    return false;
  }
  for (let i = 0; i < FLOATS_DA_MATRIZ_UV; i++) if (a.matriz[i] !== b.matriz[i]) return false;
  return true;
}

function copiarFonte(de: FonteDoRecorte, para: FonteDoRecorte): void {
  para.textura = de.textura;
  para.bufferUv = de.bufferUv;
  para.passo = de.passo;
  para.deslocamento = de.deslocamento;
  para.alphaTest = de.alphaTest;
  para.wrapS = de.wrapS;
  para.wrapT = de.wrapT;
  para.matriz.set(de.matriz);
}

/** O que avisa 'dispose' (textura e geometria do `three`): o handle de GPU dele some do backend. */
type Descartavel = { addEventListener?(tipo: string, ouvinte: () => void): void };

function ponte(): PonteDoRecorte | null {
  return (globalThis as { __cortexShadowAlphaClip?: PonteDoRecorte }).__cortexShadowAlphaClip ?? null;
}

/** Mantém o recorte alfa do host em dia com os nós do espelho (SPEC-0642). */
/**
 * Quadros de um rodízio completo pelos nós já resolvidos (mandados, ou recusados por motivo fixo). Com milhares de
 * nós de vegetação, conferir todos todo quadro custava ~0,6 ms no Hermes (SPEC-0690 §8). O que pode deixar um
 * handle morto no host (o `dispose` do mapa ou da geometria, a troca de buffer no provedor) sobe a época e força a
 * varredura completa; o rodízio só atrasa até este número de quadros uma troca de material sem `dispose`.
 */
export const ALPHA_CLIP_SWEEP_FRAMES = 16;

export class ShadowAlphaClipSync {
  private readonly _enviados = new WeakMap<Object3D, Enviado>();
  private readonly _fonte = novaFonte();
  private _api: PonteDoRecorte | null = null;
  private _fonteDoQuadro: FonteDeUvETextura | null = null;
  private _espelho: EspelhoDoRecorte | null = null;
  /** O espelho cujas saídas de nó este sync ouve, e o `off` do ouvinte. */
  private _espelhoOuvido: EspelhoDoRecorte | null = null;
  private _desouvir: (() => void) | null = null;
  /** Sobe quando o provedor troca um buffer: todo nó relê a fonte (o UV dele pode ter mudado de buffer). */
  private _epoca = 0;
  private _fonteOuvida: FonteDeUvETextura | null = null;
  private _desouvirFonte: (() => void) | null = null;
  private readonly _aoTrocarBuffer = (): void => {
    this._epoca++;
  };
  /** Mapas e geometrias cujo `dispose` já é ouvido: o handle que o host guarda some com eles. */
  private readonly _vigiados = new WeakSet<object>();
  /** O host apagou o slot do nó que saiu: quem voltar manda o `set` de novo, mesmo no mesmo slot. */
  private readonly _aoSairDoEspelho = (objeto: Object3D): void => {
    this._enviados.delete(objeto);
    this._pendentes.delete(objeto);
    this._completa = true;
  };
  /** Os nós com recorte na ordem do rodízio (refeita na varredura completa). */
  private readonly _nos: Object3D[] = [];
  private _cursor = 0;
  /** Nós ainda sem desfecho (textura ou UV sem GPU): tentam todo quadro, senão a cascata seguiria recusada. */
  private readonly _pendentes = new Set<Object3D>();
  /** O que a última varredura completa viu: mudou algum, a próxima é completa. */
  private _completa = true;
  private _tamanhoVisto = -1;
  private _geracaoVista = -1;
  private _epocaVista = -1;
  private readonly _guardarNo = (objeto: Object3D): void => {
    this._nos.push(objeto);
  };

  /**
   * Roda antes de todo passe nativo — o handle que sumiu tem de sair ANTES do desenho.
   *
   * @param fonte - De onde vêm o UV e a textura (ADR-0692); o padrão é o provedor do quadro.
   */
  sync(espelho: EspelhoDoRecorte, backend: BackendDoRecorte, fonte: FonteDeUvETextura = shadowSourceFor(backend)): void {
    const api = ponte();
    if (!api) return;
    this._ouvir(espelho);
    this._ouvirFonte(fonte);
    if (espelho.alphaClipNodes.size === 0) return;
    this._api = api;
    this._fonteDoQuadro = fonte;
    this._espelho = espelho;
    const nos = espelho.alphaClipNodes;
    const completa = this._completa || nos.size !== this._tamanhoVisto || espelho.generation !== this._geracaoVista ||
      this._epoca !== this._epocaVista;
    if (completa) {
      // `forEach` com callback fixo: o `for…of` cria iterador por quadro no Hermes.
      this._nos.length = 0;
      nos.forEach(this._guardarNo);
      this._pendentes.clear();
      for (let i = 0; i < this._nos.length; i++) this._sincronizarNo(this._nos[i]!);
      this._completa = false;
      this._tamanhoVisto = nos.size;
      this._geracaoVista = espelho.generation;
      this._epocaVista = this._epoca;
      this._cursor = 0;
    } else {
      this._pendentes.forEach(this._sincronizarNo);
      const n = this._nos.length;
      const passo = Math.ceil(n / ALPHA_CLIP_SWEEP_FRAMES);
      for (let k = 0; k < passo; k++) {
        // Os pendentes já foram tentados acima, neste mesmo quadro.
        const objeto = this._nos[this._cursor]!;
        if (!this._pendentes.has(objeto)) this._sincronizarNo(objeto);
        this._cursor = (this._cursor + 1) % n;
      }
    }
    this._api = null;
    this._fonteDoQuadro = null;
    this._espelho = null;
  }

  /** Fim do passe: solta o ouvinte de saída de nó do espelho. */
  dispose(): void {
    this._desouvirFonte?.();
    this._desouvirFonte = null;
    this._fonteOuvida = null;
    this._desouvir?.();
    this._desouvir = null;
    this._espelhoOuvido = null;
  }

  /** Provedor novo (outro renderer, ou o `three`): ouve as trocas de buffer dele e relê todos os nós. */
  private _ouvirFonte(fonte: FonteDeUvETextura): void {
    if (fonte === this._fonteOuvida) return;
    this._desouvirFonte?.();
    this._fonteOuvida = fonte;
    this._desouvirFonte = fonte.onBufferReplaced?.(this._aoTrocarBuffer) ?? null;
    this._epoca++;
  }

  private _ouvir(espelho: EspelhoDoRecorte): void {
    if (espelho === this._espelhoOuvido) return;
    this._desouvir?.();
    this._espelhoOuvido = espelho;
    this._desouvir = espelho.onAlphaClipRemoved?.(this._aoSairDoEspelho) ?? null;
  }

  /** Sincroniza um nó e o põe (ou tira) dos pendentes conforme o desfecho. */
  private readonly _sincronizarNo = (objeto: Object3D): void => {
    this._sincronizar(objeto);
    const enviado = this._enviados.get(objeto);
    if (enviado && !enviado.mandado && !enviado.recusaFixa) this._pendentes.add(objeto);
    else this._pendentes.delete(objeto);
  };

  private _sincronizar(objeto: Object3D): void {
    const espelho = this._espelho!;
    const api = this._api!;
    const indice = espelho.nodeIndex(objeto);
    if (indice === undefined) return;
    const geracao = espelho.generation;
    let enviado = this._enviados.get(objeto);
    if (!enviado) {
      enviado = {
        ...novaFonte(), ...novaChave(), ...novaChaveDaRecusa(), indice, geracao, mandado: false, registrado: false, motivo: '',
      };
      this._enviados.set(objeto, enviado);
    }
    // Slot ou espelho novos: o host já esqueceu o que era deste nó.
    const mesmoSlot = enviado.indice === indice && enviado.geracao === geracao;
    if (!mesmoSlot) {
      enviado.mandado = false;
      enviado.registrado = false;
    }
    // Regime normal: já mandado, mesmo slot e nada mudou no objeto nem no provedor — sem consultar nada.
    if (enviado.mandado && mesmoSlot && mesmaChave(objeto as ObjetoDoRecorte, enviado, this._epoca)) return;
    // Recusa que só depende do objeto (`alphaMap`, UV fora do formato…): nada mudou, segue recusada sem reler.
    if (!enviado.mandado && mesmaRecusa(objeto as ObjetoDoRecorte, enviado, this._epoca)) return;

    const motivo = lerFonteDoRecorte(objeto, this._fonteDoQuadro!, this._fonte);
    if (motivo !== null) {
      // Só apaga o que é DESTE nó: o slot antigo pode já ser de outro.
      if (enviado.registrado && mesmoSlot) api.erase(indice);
      enviado.mandado = false;
      enviado.registrado = false;
      guardarRecusa(objeto as ObjetoDoRecorte, enviado, motivo, this._epoca);
      this._relatar(objeto, enviado, motivo);
      return;
    }
    if (enviado.mandado && mesmoSlot && mesmaFonte(enviado, this._fonte)) {
      this._guardar(objeto as ObjetoDoRecorte, enviado);
      return;
    }

    const f = this._fonte;
    const ok = api.set(indice, f.textura, f.bufferUv, f.passo, f.deslocamento, f.alphaTest, f.wrapS, f.wrapT, f.matriz);
    copiarFonte(f, enviado);
    enviado.indice = indice;
    enviado.geracao = geracao;
    enviado.mandado = true;
    enviado.registrado = ok;
    enviado.recusaFixa = false;
    this._guardar(objeto as ObjetoDoRecorte, enviado);
    this._relatar(objeto, enviado, ok ? 'registrado' : 'host-recusou');
  }

  /** Guarda a chave do que foi mandado e passa a ouvir o `dispose` do mapa e da geometria (sobe a época). */
  private _guardar(objeto: ObjetoDoRecorte, enviado: Enviado): void {
    guardarChave(objeto, enviado, this._epoca);
    this._vigiar(enviado.mapa as Descartavel);
    this._vigiar(enviado.geometria as Descartavel);
  }

  private _vigiar(alvo: Descartavel | null | undefined): void {
    if (!alvo || this._vigiados.has(alvo)) return;
    this._vigiados.add(alvo);
    alvo.addEventListener?.('dispose', this._aoTrocarBuffer);
  }

  /** Uma linha por mudança de estado do nó — nunca por quadro. */
  private _relatar(objeto: Object3D, enviado: Enviado, motivo: string): void {
    if (enviado.motivo === motivo) return;
    enviado.motivo = motivo;
    debug('perf', `[shadowAlphaClip] no=${objeto.name || objeto.type} ${motivo}`);
  }
}
