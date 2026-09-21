/**
 * Descrição de material independente de backend (M1 do ADR-0237).
 *
 * O `three` resolve material por objeto, em JS, pelo sistema de nodes — e é a
 * maior fatia do `renderObject` (33%, SPEC-0227). O C++ não tem como consumir
 * esse grafo. O que ele consegue consumir é **uma descrição de dados**, e é o
 * que este módulo produz: uma vez por material, não por frame.
 *
 * Duas coisas definem o desenho:
 *
 * - **É um subconjunto declarado, não uma tradução completa.** O que não couber
 *   aqui é marcado como "só three" e continua no caminho antigo — é o escape
 *   hatch que impede um material exótico de travar a migração inteira.
 * - **Não inventa aparência.** Se uma propriedade não tem equivalente, o
 *   material é recusado em vez de aproximado: aproximar produz diferença visual
 *   sutil, que é o modo de falha mais caro desta migração (SPEC-0234).
 */
import { Color, Material, type Texture } from 'three';
import { OUTLINE_THICKNESS_KEY } from '../scene/Materials.js';

/** Como o fragmento é sombreado. Espelha o que a engine hoje produz. */
export type ShadingModel = 'standard' | 'unlit' | 'toon' | 'outline';

/** Como o material lida com transparência. */
export type BlendMode = 'opaque' | 'blend';

/** O material descrito como dado puro, pronto para atravessar para o C++. */
export interface MaterialDesc {
  shading: ShadingModel;
  /** Cor base linear, 0-1. */
  color: [number, number, number];
  opacity: number;
  blend: BlendMode;
  metalness: number;
  roughness: number;
  emissive: [number, number, number];
  /** `true` quando desenha os dois lados (dobra o trabalho de fragmento). */
  doubleSided: boolean;
  /** Fora do tone mapping ACES — a UI depende disso (ADR-0105). */
  toneMapped: boolean;
  /** Id da textura base, quando há; o C++ resolve o handle por este id. */
  baseTextureId: string | null;
  /**
   * Espessura da casca de contorno, quando `shading` é `outline`. O efeito
   * extruda o vértice pela normal — é um vertex shader curto, não TSL
   * arbitrário, e por isso cabe na descrição.
   */
  outlineThickness: number | null;
}

/** Por que um material não coube na descrição. */
export interface MaterialRejection {
  reason: string;
}

const OPAQUE_ALPHA = 1;

/**
 * Tipo do three → modelo de sombreamento, por nome exato.
 *
 * As variantes `*NodeMaterial` estão aqui porque **são o que o renderer WebGPU
 * de fato usa**: na cena do kart-racer, 122 dos 271 materiais são
 * `MeshBasicNodeMaterial`. Aceitar só os nomes clássicos deixava metade da cena
 * de fora sem motivo real — o material é o mesmo, a classe é que é a do
 * backend de nodes.
 */
const SHADING_BY_TYPE: Record<string, ShadingModel | undefined> = {
  MeshStandardMaterial: 'standard',
  MeshStandardNodeMaterial: 'standard',
  MeshToonMaterial: 'toon',
  MeshToonNodeMaterial: 'toon',
  MeshBasicMaterial: 'unlit',
  MeshBasicNodeMaterial: 'unlit',
};

/**
 * Nós do TSL que, se presentes, significam que a aparência vem de um **grafo**
 * e não das propriedades — aí a descrição não representa o material, e ele fica
 * no caminho do `three`.
 */
const CUSTOM_NODES = [
  'colorNode',
  'fragmentNode',
  'vertexNode',
  'outputNode',
  'emissiveNode',
  'metalnessNode',
  'roughnessNode',
  'opacityNode',
  'normalNode',
  'positionNode',
] as const;

/**
 * Propriedades cuja presença significa que o material faz algo que a descrição
 * não representa. Estar nesta lista não é defeito do material — é o limite
 * honesto do formato, e o motivo de existir o caminho "só three".
 */
const UNSUPPORTED_MAPS = [
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
  'envMap',
  'bumpMap',
  'clearcoatMap',
] as const;

function toTuple(color: Color | undefined): [number, number, number] {
  return color ? [color.r, color.g, color.b] : [0, 0, 0];
}

/** Id estável de uma textura — o C++ usa como chave do handle dela. */
export function textureId(texture: Texture | null | undefined): string | null {
  if (!texture) return null;
  return texture.uuid;
}

/**
 * Descreve o material, ou explica por que ele não cabe.
 *
 * Recusa em vez de aproximar: material descrito errado vira diferença visual
 * sutil, e essa é a falha mais cara desta migração.
 */
export function describeMaterial(material: Material): MaterialDesc | MaterialRejection {
  for (const mapName of UNSUPPORTED_MAPS) {
    if ((material as unknown as Record<string, unknown>)[mapName]) {
      return { reason: `usa ${mapName}, que a descrição não representa` };
    }
  }

  // Tipo EXATO, e não `instanceof`: `MeshPhysicalMaterial` estende o standard e
  // passaria no teste de herança, trazendo clearcoat, sheen e transmissão que
  // esta descrição não representa — e o material sairia aproximado, não fiel.
  const shading = SHADING_BY_TYPE[material.type];
  if (!shading) {
    return { reason: `tipo ${material.type} fora do subconjunto (standard/toon/basic)` };
  }

  // A casca de contorno tem grafo, mas é um efeito CONHECIDO e declarado pela
  // engine (OUTLINE_THICKNESS_KEY): descrevê-lo é honesto, e ele responde por
  // 45% dos materiais da cena do kart-racer.
  const outlineThickness = material.userData?.[OUTLINE_THICKNESS_KEY];
  if (typeof outlineThickness === 'number') {
    return {
      shading: 'outline',
      color: toTuple((material as unknown as { color?: Color }).color),
      opacity: material.opacity,
      blend: material.transparent ? 'blend' : 'opaque',
      metalness: 0,
      roughness: 1,
      emissive: [0, 0, 0],
      doubleSided: false,
      toneMapped: material.toneMapped,
      baseTextureId: null,
      outlineThickness,
    };
  }

  for (const nodeName of CUSTOM_NODES) {
    if ((material as unknown as Record<string, unknown>)[nodeName]) {
      return { reason: `tem ${nodeName} (grafo TSL), que só o three sabe avaliar` };
    }
  }

  const comCor = material as unknown as {
    color?: Color;
    emissive?: Color;
    metalness?: number;
    roughness?: number;
    map?: Texture | null;
  };

  return {
    shading,
    color: toTuple(comCor.color),
    opacity: material.opacity,
    // `alphaTest` e `blending` custom não entram no subconjunto; o que a engine
    // usa hoje é opaco ou blend comum.
    blend: material.transparent || material.opacity < OPAQUE_ALPHA ? 'blend' : 'opaque',
    metalness: comCor.metalness ?? 0,
    roughness: comCor.roughness ?? 1,
    emissive: toTuple(comCor.emissive),
    doubleSided: material.side === 2,
    toneMapped: material.toneMapped,
    baseTextureId: textureId(comCor.map),
    outlineThickness: null,
  };
}

/** `true` quando `describeMaterial` conseguiu descrever. */
export function isDescribed(result: MaterialDesc | MaterialRejection): result is MaterialDesc {
  return (result as MaterialDesc).shading !== undefined;
}

/** Cobertura da descrição numa cena — é o critério de aceitação do M1. */
export interface MaterialCoverage {
  total: number;
  described: number;
  /** Motivo → quantos materiais caíram nele. */
  rejections: Record<string, number>;
}

/**
 * Percorre os materiais e mede quanto da cena o formato cobre.
 *
 * Roda uma vez, em diagnóstico — não por frame.
 */
export function measureCoverage(materials: Iterable<Material>): MaterialCoverage {
  const coverage: MaterialCoverage = { total: 0, described: 0, rejections: {} };
  for (const material of materials) {
    coverage.total++;
    const result = describeMaterial(material);
    if (isDescribed(result)) {
      coverage.described++;
      continue;
    }
    const reason = result.reason;
    coverage.rejections[reason] = (coverage.rejections[reason] ?? 0) + 1;
  }
  return coverage;
}
