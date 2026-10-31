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
 * Só atravessa a ponte quando algo mudou: no regime normal o trabalho por quadro
 * é comparar meia dúzia de campos por nó com recorte, sem alocar.
 *
 * O que o host não sabe reproduzir (`alphaMap`, `colorNode`, máscaras, UV em outro
 * canal ou quantizado) NÃO é registrado — o gate segue recusando o quadro, e o
 * `three` desenha a sombra como sempre. Recusar em vez de aproximar.
 */
import type { Object3D } from 'three';
import { debug } from '../core/debug.js';

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
}

/** Floats da `Matrix3` do `three`. */
const FLOATS_DA_MATRIZ_UV = 9;
/** Componentes de um UV e bytes por float. */
const COMPONENTES_DO_UV = 2;
const BYTES_POR_FLOAT = 4;
/** Único canal de UV que o host lê (`uv`, não `uv1`…). */
const CANAL_DO_UV = 0;

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
interface Enviado extends FonteDoRecorte {
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

type MaterialDoRecorte = {
  alphaTest?: number;
  alphaMap?: unknown;
  colorNode?: unknown;
  castShadowNode?: unknown;
  maskNode?: unknown;
  maskShadowNode?: unknown;
  map?: {
    channel?: number;
    wrapS: number;
    wrapT: number;
    matrixAutoUpdate?: boolean;
    updateMatrix?(): void;
    matrix: { elements: ArrayLike<number> };
  } | null;
};

type AtributoUv = {
  itemSize?: number;
  normalized?: boolean;
  array?: unknown;
  isInterleavedBufferAttribute?: boolean;
  offset?: number;
  data?: { stride?: number; array?: unknown };
};

/**
 * Lê em `destino` o recorte que o `three` aplicaria a `objeto`.
 *
 * @returns `null` quando o host consegue reproduzir; senão o motivo (texto curto
 *   para o log) — e aí o recorte não é registrado.
 */
export function lerFonteDoRecorte(
  objeto: Object3D,
  backend: BackendDoRecorte,
  destino: FonteDoRecorte,
): string | null {
  const malha = objeto as Object3D & {
    material?: MaterialDoRecorte | MaterialDoRecorte[];
    geometry?: { getAttribute?(nome: string): unknown };
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

  const uv = malha.geometry?.getAttribute?.('uv') as AtributoUv | undefined;
  if (!uv || uv.itemSize !== COMPONENTES_DO_UV || uv.normalized) return 'uv-ausente';
  const intercalado = uv.isInterleavedBufferAttribute === true;
  const dono = intercalado ? uv.data : uv;
  if (!dono || !(dono.array instanceof Float32Array)) return 'uv-nao-float32';

  const textura = backend.get(mapa)?.texture;
  if (!textura) return 'textura-sem-gpu';
  const bufferUv = backend.get(dono)?.buffer;
  if (!bufferUv) return 'uv-sem-gpu';

  // O `TextureNode` do `three` atualiza a matriz por objeto desenhado; aqui é a
  // mesma conta (`setUvTransform`), barata e sem alocar.
  if (mapa.matrixAutoUpdate) mapa.updateMatrix?.();
  const elementos = mapa.matrix.elements;
  for (let i = 0; i < FLOATS_DA_MATRIZ_UV; i++) destino.matriz[i] = elementos[i]!;
  destino.textura = textura;
  destino.bufferUv = bufferUv;
  destino.passo = intercalado
    ? (uv.data?.stride ?? COMPONENTES_DO_UV) * BYTES_POR_FLOAT
    : COMPONENTES_DO_UV * BYTES_POR_FLOAT;
  destino.deslocamento = intercalado ? (uv.offset ?? 0) * BYTES_POR_FLOAT : 0;
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

function ponte(): PonteDoRecorte | null {
  return (globalThis as { __cortexShadowAlphaClip?: PonteDoRecorte }).__cortexShadowAlphaClip ?? null;
}

/** Mantém o recorte alfa do host em dia com os nós do espelho (SPEC-0642). */
export class ShadowAlphaClipSync {
  private readonly _enviados = new WeakMap<Object3D, Enviado>();
  private readonly _fonte = novaFonte();
  private _api: PonteDoRecorte | null = null;
  private _backend: BackendDoRecorte | null = null;
  private _espelho: EspelhoDoRecorte | null = null;

  /** Roda antes de todo passe nativo — o handle que sumiu tem de sair ANTES do desenho. */
  sync(espelho: EspelhoDoRecorte, backend: BackendDoRecorte): void {
    const api = ponte();
    if (!api || espelho.alphaClipNodes.size === 0) return;
    this._api = api;
    this._backend = backend;
    this._espelho = espelho;
    // `forEach` com callback fixo: o `for…of` cria iterador por quadro no Hermes.
    espelho.alphaClipNodes.forEach(this._sincronizarNo);
    this._api = null;
    this._backend = null;
    this._espelho = null;
  }

  private readonly _sincronizarNo = (objeto: Object3D): void => {
    const espelho = this._espelho!;
    const api = this._api!;
    const indice = espelho.nodeIndex(objeto);
    if (indice === undefined) return;
    const geracao = espelho.generation;
    let enviado = this._enviados.get(objeto);
    if (!enviado) {
      enviado = { ...novaFonte(), indice, geracao, mandado: false, registrado: false, motivo: '' };
      this._enviados.set(objeto, enviado);
    }
    // Slot ou espelho novos: o host já esqueceu o que era deste nó.
    const mesmoSlot = enviado.indice === indice && enviado.geracao === geracao;
    if (!mesmoSlot) {
      enviado.mandado = false;
      enviado.registrado = false;
    }

    const motivo = lerFonteDoRecorte(objeto, this._backend!, this._fonte);
    if (motivo !== null) {
      // Só apaga o que é DESTE nó: o slot antigo pode já ser de outro.
      if (enviado.registrado && mesmoSlot) api.erase(indice);
      enviado.mandado = false;
      enviado.registrado = false;
      this._relatar(objeto, enviado, motivo);
      return;
    }
    if (enviado.mandado && mesmoSlot && mesmaFonte(enviado, this._fonte)) return;

    const f = this._fonte;
    const ok = api.set(indice, f.textura, f.bufferUv, f.passo, f.deslocamento, f.alphaTest, f.wrapS, f.wrapT, f.matriz);
    copiarFonte(f, enviado);
    enviado.indice = indice;
    enviado.geracao = geracao;
    enviado.mandado = true;
    enviado.registrado = ok;
    this._relatar(objeto, enviado, ok ? 'registrado' : 'host-recusou');
  };

  /** Uma linha por mudança de estado do nó — nunca por quadro. */
  private _relatar(objeto: Object3D, enviado: Enviado, motivo: string): void {
    if (enviado.motivo === motivo) return;
    enviado.motivo = motivo;
    debug('perf', `[shadowAlphaClip] no=${objeto.name || objeto.type} ${motivo}`);
  }
}
