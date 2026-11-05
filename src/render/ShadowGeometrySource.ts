/**
 * Provedor da geometria e do UV do passe de sombra nativo (ADR-0692, SPEC-0690 item 7).
 *
 * O registro de geometria dos casters e a store de recorte alfa precisam dos `GPUBuffer` de cada malha. Com o
 * NativeRenderer, o passe principal de boa parte da cena é nativo e o `three` nunca sobe os buffers dela: ler só
 * do backend do `three` deixava a geometria pendente para sempre. O provedor resolve na ordem:
 *
 * 1. o buffer do store nativo (`NativeGeometryStore`);
 * 2. o buffer do backend do `three`;
 * 3. upload pelo store nativo (só a `position` `float32x3` e o índice), reaproveitado depois pelo desenho principal.
 *
 * Sem NativeRenderer, o provedor é só o `three` ({@link ThreeShadowSource}), como antes.
 */
import type * as THREE from 'three';
import { geometryBuffers, type GeometryBuffers } from './GeometryDesc.js';

/** Motivo de quem tem `position` fora de `float32x3` (o pipeline do passe só aceita esse formato). */
export const POSITION_FORMAT_REFUSAL = 'posicao-nao-float32x3';
/** Componentes da posição e do UV, e bytes por float. */
const POSITION_COMPONENTS = 3;
const UV_COMPONENTS = 2;
const FLOAT_BYTES = 4;

/**
 * Resultado de {@link ShadowGeometrySource.buffers}: os buffers; `null` = ainda não há (tentar de novo depois);
 * texto = recusa permanente (o motivo), que não adianta tentar de novo.
 */
export type ShadowBuffersResult = GeometryBuffers | string | null;

/** Onde está o UV de uma geometria: o buffer (o slot que carrega o `uv`), o passo e o deslocamento em bytes. */
export interface ShadowUvSlot {
  buffer: unknown;
  stride: number;
  offset: number;
}

/** De onde o passe de sombra tira a geometria, o UV e a textura dos casters (ADR-0692). */
export interface ShadowGeometrySource {
  /** Nome curto para o relato (`nativo`, `three`). */
  readonly kind: string;
  /** Bytes que este provedor subiu até agora (o orçamento por quadro do registro é a diferença). */
  readonly uploadedBytes: number;
  /** Buffers da `position` e do índice; com `upload`, sobe o que falta (quando o provedor sabe subir). */
  buffers(geometry: THREE.BufferGeometry, upload: boolean): ShadowBuffersResult;
  /**
   * Escreve em `out` o slot do `uv` (canal 0, `float32x2`); `false` = sem buffer. Preenche um destino de quem
   * chama, sem alocar: o recorte alfa pergunta todo quadro, para cada nó com recorte.
   */
  uv(geometry: THREE.BufferGeometry, out: ShadowUvSlot): boolean;
  /** O `GPUTexture` do `map` (subindo, quando o provedor sabe), ou `null`. */
  texture(map: unknown): unknown;
  /** Avisa quando o buffer de uma fonte (atributo, `InterleavedBuffer` ou índice) foi refeito. Devolve o `off`. */
  onBufferReplaced?(listener: (source: object) => void): () => void;
  /**
   * Por quadro, antes da drenagem: mantém em dia as cópias que só o passe de sombra usa (o desenho principal é do
   * `three`, que não reescreve a cópia do provedor). Custo proporcional só a essas cópias.
   */
  refresh?(): void;
  /** A geometria foi descartada: esquece as cópias que só a sombra usava dela (não prende os arrays, SPEC-0289). */
  forget?(geometry: THREE.BufferGeometry): void;
}

/** Onde está o buffer do `uv`: o dono (atributo ou bloco intercalado), o passo e o deslocamento em bytes. */
export interface UvLayout {
  owner: object | null;
  stride: number;
  offset: number;
}

/** O backend do `three`, de onde saem os handles de GPU. */
export interface ShadowSourceBackend {
  get(alvo: unknown): { buffer?: unknown; texture?: unknown } | undefined;
}

/** O que se lê de um atributo para conferir o formato e achar o dono do buffer. */
export interface AttributeShape {
  array?: unknown;
  itemSize?: number;
  normalized?: boolean;
  isInterleavedBufferAttribute?: boolean;
  offset?: number;
  data?: { array?: unknown; stride?: number };
}

/**
 * `position` fora de `float32x3` não normalizado: o motivo; senão `null`. Sem array (forma mínima de teste),
 * não há o que conferir.
 */
export function positionFormatRefusal(geometry: THREE.BufferGeometry): string | null {
  const pos = geometry.getAttribute?.('position') as AttributeShape | undefined;
  if (!pos) return null;
  const array = pos.isInterleavedBufferAttribute === true ? pos.data?.array : pos.array;
  if (array === undefined) return null;
  const ok = array instanceof Float32Array && pos.itemSize === POSITION_COMPONENTS && pos.normalized !== true;
  return ok ? null : POSITION_FORMAT_REFUSAL;
}

/**
 * Escreve em `out` o dono do buffer de GPU do atributo `uv` (o bloco, quando intercalado), com passo e deslocamento
 * em bytes. `false` = sem `uv` (ou intercalado sem bloco). Sem alocar.
 */
export function uvLayoutInto(uv: AttributeShape | undefined, out: UvLayout): boolean {
  if (!uv) return false;
  if (uv.isInterleavedBufferAttribute === true) {
    if (!uv.data) return false;
    out.owner = uv.data;
    out.stride = (uv.data.stride ?? UV_COMPONENTS) * FLOAT_BYTES;
    out.offset = (uv.offset ?? 0) * FLOAT_BYTES;
    return true;
  }
  out.owner = uv as object;
  out.stride = UV_COMPONENTS * FLOAT_BYTES;
  out.offset = 0;
  return true;
}

/** O provedor só do `three` (sem NativeRenderer): o comportamento de antes do ADR-0692. */
export class ThreeShadowSource implements ShadowGeometrySource {
  readonly kind = 'three';
  readonly uploadedBytes = 0;
  /** Destino reaproveitado do layout do `uv` (sem alocar por quadro). */
  private readonly _layout: UvLayout = { owner: null, stride: 0, offset: 0 };

  constructor(private readonly _backend: ShadowSourceBackend) {}

  buffers(geometry: THREE.BufferGeometry): ShadowBuffersResult {
    return positionFormatRefusal(geometry) ?? geometryBuffers(this._backend, geometry);
  }

  uv(geometry: THREE.BufferGeometry, out: ShadowUvSlot): boolean {
    const layout = this._layout;
    if (!uvLayoutInto(geometry.getAttribute?.('uv') as AttributeShape | undefined, layout)) return false;
    const buffer = this._backend.get(layout.owner)?.buffer;
    if (!buffer) return false;
    out.buffer = buffer;
    out.stride = layout.stride;
    out.offset = layout.offset;
    return true;
  }

  texture(map: unknown): unknown {
    return this._backend.get(map)?.texture ?? null;
  }
}

/** O provedor do NativeRenderer anexado, quando há um (o `createNativeRenderer` o publica). */
let activeNative: ShadowGeometrySource | null = null;
/** Um provedor do `three` por backend: o passe pede o provedor todo quadro, sem alocar. */
const threeSources = new WeakMap<object, ThreeShadowSource>();

/** Publica (ou tira, com `null`) o provedor do NativeRenderer anexado ao RenderServer. */
export function setActiveShadowSource(source: ShadowGeometrySource | null): void {
  activeNative = source;
}

/** O provedor do quadro: o do NativeRenderer, quando anexado; senão o do `three` deste backend. */
export function shadowSourceFor(backend: ShadowSourceBackend): ShadowGeometrySource {
  if (activeNative !== null) return activeNative;
  let three = threeSources.get(backend);
  if (!three) {
    three = new ThreeShadowSource(backend);
    threeSources.set(backend, three);
  }
  return three;
}
