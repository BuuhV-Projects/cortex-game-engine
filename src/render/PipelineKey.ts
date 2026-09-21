/**
 * Chave de pipeline (M2 do ADR-0237 / SPEC-0238).
 *
 * Um `WGPURenderPipeline` é caro de criar — compila shader no driver — e o
 * critério do marco é **não criar nenhum por frame**. Para isso, dois materiais
 * que só diferem em **cor** precisam cair na mesma chave.
 *
 * A separação que define este módulo: o que muda o **pipeline** entra na chave;
 * o que muda só o **valor** é uniform e fica de fora. Pôr cor na chave
 * multiplicaria pipelines por instância de cor, que é exatamente o problema que
 * o marco existe para evitar.
 */
import type { MaterialDesc, ShadingModel } from './MaterialDesc.js';

/** Bits de cada campo na chave empacotada. A ordem é contrato com o C++. */
const SHADING_BITS = 3;
const BLEND_BITS = 2;
const FLAG_BITS = 1;
/** Layout de vértice e formato do alvo são catalogados; o id basta. */
const VERTEX_LAYOUT_BITS = 8;
const TARGET_FORMAT_BITS = 8;

const SHADING_CODE: Record<ShadingModel, number> = {
  standard: 0,
  unlit: 1,
  toon: 2,
  outline: 3,
};

/** O que o pipeline precisa saber além do material. */
export interface PipelineContext {
  /** Id do layout de vértice (posição/normal/uv…), catalogado pelo host. */
  vertexLayoutId: number;
  /** Id do formato do alvo de render (cor + profundidade). */
  targetFormatId: number;
}

/**
 * Empacota a chave num número.
 *
 * Cabe em `Number.MAX_SAFE_INTEGER` (2^53) com folga: os campos somam 23 bits.
 * Usar número e não `BigInt` mantém a comparação barata do lado JS; o C++ lê o
 * mesmo layout de bits num `uint64_t`.
 */
export function pipelineKey(desc: MaterialDesc, context: PipelineContext): number {
  let key = SHADING_CODE[desc.shading];
  let shift = SHADING_BITS;

  key |= (desc.blend === 'blend' ? 1 : 0) << shift;
  shift += BLEND_BITS;

  // `doubleSided` entra na chave porque é `cullMode` — estado do pipeline — mas
  // NÃO vira constante no shader: não muda uma linha do WGSL compilado.
  key |= (desc.doubleSided ? 1 : 0) << shift;
  shift += FLAG_BITS;

  // `toneMapped` é branch no fragmento: muda o shader, então muda o pipeline.
  key |= (desc.toneMapped ? 1 : 0) << shift;
  shift += FLAG_BITS;

  // A presença da textura muda o shader; QUAL textura é bind group, não pipeline.
  key |= (desc.baseTextureId !== null ? 1 : 0) << shift;
  shift += FLAG_BITS;

  key |= (context.vertexLayoutId & ((1 << VERTEX_LAYOUT_BITS) - 1)) << shift;
  shift += VERTEX_LAYOUT_BITS;

  key |= (context.targetFormatId & ((1 << TARGET_FORMAT_BITS) - 1)) << shift;
  shift += TARGET_FORMAT_BITS;

  return key >>> 0;
}

/** Os campos de volta, para teste e para diagnóstico legível. */
export interface UnpackedKey {
  shading: ShadingModel;
  blend: boolean;
  doubleSided: boolean;
  toneMapped: boolean;
  hasBaseTexture: boolean;
  vertexLayoutId: number;
  targetFormatId: number;
}

const SHADING_BY_CODE = Object.entries(SHADING_CODE).reduce<Record<number, ShadingModel>>(
  (acc, [name, code]) => {
    acc[code] = name as ShadingModel;
    return acc;
  },
  {},
);

export function unpackPipelineKey(key: number): UnpackedKey {
  let shift = 0;
  const read = (bits: number): number => {
    const value = (key >>> shift) & ((1 << bits) - 1);
    shift += bits;
    return value;
  };
  const shading = SHADING_BY_CODE[read(SHADING_BITS)] ?? 'standard';
  const blend = read(BLEND_BITS) !== 0;
  const doubleSided = read(FLAG_BITS) !== 0;
  const toneMapped = read(FLAG_BITS) !== 0;
  const hasBaseTexture = read(FLAG_BITS) !== 0;
  return {
    shading,
    blend,
    doubleSided,
    toneMapped,
    hasBaseTexture,
    vertexLayoutId: read(VERTEX_LAYOUT_BITS),
    targetFormatId: read(TARGET_FORMAT_BITS),
  };
}

/**
 * Quantos pipelines distintos um conjunto de materiais gera.
 *
 * É o passo 2 da SPEC-0238: a resposta muda o peso do problema de compilação no
 * carregamento, e custa minutos para saber — contra a alternativa de descobrir
 * com a cena montada e um hitch inexplicado.
 */
export function countDistinctPipelines(
  descs: Iterable<MaterialDesc>,
  context: PipelineContext,
): { total: number; distinct: number; byShading: Record<string, number> } {
  const keys = new Set<number>();
  const byShading: Record<string, number> = {};
  let total = 0;
  for (const desc of descs) {
    total++;
    keys.add(pipelineKey(desc, context));
    byShading[desc.shading] = (byShading[desc.shading] ?? 0) + 1;
  }
  return { total, distinct: keys.size, byShading };
}
