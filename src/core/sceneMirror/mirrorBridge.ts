/**
 * A ponte que o host nativo publica para o espelho de cena (`__cortexSceneMirror`)
 * e para a projeção do passe principal (`__cortexMainPass`), e o vocabulário do
 * veredito do gate de sombra. Saiu do `NativeSceneMirror.ts` (SPEC-0678).
 */
import type { Object3D } from 'three';

/** A API que o host publica; ausente no browser, onde tudo isto é no-op. */
export interface SceneMirrorBridge {
  build(description: Float32Array): boolean;
  worldMatrices(): Float64Array | undefined;
  syncBuffer(): Float64Array | undefined;
  update(changedNodes: number, planes: Float32Array): number;
  /**
   * Acrescenta uma subárvore ao espelho sem reconstruí-lo. Devolve quantos nós
   * entraram (escrevendo o índice de cada um em `out`) ou um código negativo.
   */
  appendNodes?(description: Float32Array, out: Int32Array): number;
  /** Tira do espelho o nó e a subárvore dele. Devolve quantos saíram. */
  removeNode?(index: number): number;
  /**
   * Matrizes de instância de um `InstancedMesh` espelhado (SPEC-0289). Sem
   * elas o gate recusa o nó (`instanced`).
   */
  setInstances?(index: number, matrices: Float32Array, count: number): boolean;
  drawShadowPass?(
    minRatio: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    planes: Float32Array,
    viewProjection: Float64Array,
    target: unknown,
    sceneNodeCount: number,
    vsmShadowMap: boolean,
    out: Float64Array,
  ): number | undefined;
}

/**
 * Motivos de recusa do gate, na ordem de `ShadowGateRefusal`
 * (`shadow_pass_gate.h`). O índice É o código que o C++ devolve.
 */
export const SHADOW_GATE_REASONS = [
  'aceito',
  'divergencia-de-nos',
  'vsm',
  'skinned',
  'instanced',
  'material-em-array',
  'recorte-alfa',
  'position-node',
  'geometria-ausente',
  'lado-nao-reproduzivel',
] as const;

export type ShadowGateReason = (typeof SHADOW_GATE_REASONS)[number];

/** Posições do vetor de saída do gate (ver `kGateOut*` em `scene_mirror_shim.cpp`). */
export const GATE_OUT_TOTAL_CASTERS = SHADOW_GATE_REASONS.length + 1;
/** Índice do primeiro nó ofensor, ou -1 (SPEC-0289). */
export const GATE_OUT_FIRST_OFFENDER = SHADOW_GATE_REASONS.length + 2;
/** Casters que o shim descartou depois do gate: geometria, lote instanciado ou recorte alfa ausente (SPEC-0690). */
export const GATE_OUT_SKIPPED = SHADOW_GATE_REASONS.length + 3;
/** Casters skinned tirados da lista: não recusam mais a cascata (SPEC-0690, ADR-0691). */
export const GATE_OUT_EXCLUDED = SHADOW_GATE_REASONS.length + 4;
/** Status do desenho (`kGateOutStatus`, SPEC-0690); o host escreve código + 1, e o 0 que o JS escreve antes = host antigo. */
export const GATE_OUT_STATUS = SHADOW_GATE_REASONS.length + 5;
export const GATE_OUT_FLOATS = SHADOW_GATE_REASONS.length + 6;

/**
 * Status do desenho de uma cascata (SPEC-0690). `cleared-empty` = nenhum caster, o alvo foi limpo (aceito);
 * `not-ready` = geometria ou pipeline ainda sem GPU, nada submetido; `skipped` = o shim descartou caster, nada
 * desenhado nem limpo. Host anterior à SPEC-0690 não escreve status (ver {@link ShadowPassOutcome.status}).
 */
export type ShadowPassStatus = 'ok' | 'cleared-empty' | 'not-ready' | 'refused' | 'skipped';

/** Motivo da recusa: o do gate, ou o do desenho (`nao-pronto`, `descartado`, `sem-alvo`; SPEC-0690). */
export type ShadowPassReason = ShadowGateReason | 'nao-pronto' | 'descartado' | 'sem-alvo';

/** Resultado de {@link NativeSceneMirror.drawShadowPass} (SPEC-0245, E5). */
export interface ShadowPassOutcome {
  /** Casters desenhados em C++; `0` quando recusado. */
  drawn: number;
  /** O gate ou o desenho recusou o frame — o `three` mantém o passe dele. */
  refused: boolean;
  /** Motivo da recusa, ou `'aceito'`. */
  reason: ShadowPassReason;
  /** Casters enumerados no frame. */
  totalCasters: number;
  /** Casters descartados pelo shim depois do gate (SPEC-0690); `undefined` em host antigo. */
  skipped?: number;
  /** Casters skinned excluídos da lista (SPEC-0690); `undefined` em host antigo. */
  excluded?: number;
  /**
   * Status do desenho (SPEC-0690). `undefined` = host anterior à SPEC-0690, que não escreve o slot: vale a regra
   * antiga (`drawn === 0` é recusa).
   */
  status?: ShadowPassStatus;
  /**
   * O primeiro objeto que caiu no motivo da recusa (SPEC-0289), para o relato
   * dizer QUAL nó recusou — `undefined` quando aceito ou motivo do frame inteiro.
   */
  offender?: Object3D;
  /** Motivos com contagem > 0 na recusa, ex. `instanced=4 geometria-ausente=2`. */
  counts?: string;
}

/** A ponte do passe principal (SPEC-0332); ausente em host antigo e no browser. */
export interface MainPassBridge {
  /** Com `versions` (host com {@link MainPassBridge.worldVersions}): a versão do mundo de cada candidato (SPEC-0682). */
  /** Com `cameraLayers` (host com {@link MainPassBridge.layerMask}): o host filtra pelas camadas (SPEC-0686). */
  project(
    planes: Float64Array, viewProj: Float64Array, indices: Int32Array, depths: Float64Array, versions?: Float64Array, cameraLayers?: number,
  ): number;
  /** O host aceita o 5º argumento de `project` (SPEC-0682); ausente em host antigo. */
  readonly worldVersions?: boolean;
  setBounds(index: number, cx: number, cy: number, cz: number, radius: number): void;
  /** O host filtra pelas camadas: 6º argumento de `project`, `setLayers` e `resetSlots` (SPEC-0686). */
  readonly layerMask?: boolean;
  /** O host corta pela esfera do OBJETO: `setObjectSphere`/`clearObjectSphere` (SPEC-0686). */
  readonly objectSpheres?: boolean;
  setLayers?(index: number, mask: number): void;
  /** Esfera do objeto (corte) e centro da esfera da geometria (`z`), locais. */
  setObjectSphere?(index: number, ocx: number, ocy: number, ocz: number, oradius: number, gcx: number, gcy: number, gcz: number): void;
  clearObjectSphere?(index: number): void;
  /** O espelho foi reconstruído: camadas e esferas de todos os slots voltam ao padrão. */
  resetSlots?(): void;
}

/** `__cortexMainPass`, quando o host o publica. */
export function mainPassBridge(): MainPassBridge | undefined {
  const api = (globalThis as { __cortexMainPass?: MainPassBridge }).__cortexMainPass;
  return typeof api?.project === 'function' ? api : undefined;
}


export function hostSceneMirrorBridge(): SceneMirrorBridge | undefined {
  const api = (globalThis as { __cortexSceneMirror?: SceneMirrorBridge }).__cortexSceneMirror;
  return typeof api?.build === 'function' ? api : undefined;
}

/** `true` quando o host expõe o espelho (export nativo). */
export function nativeSceneMirrorAvailable(): boolean {
  return hostSceneMirrorBridge() !== undefined;
}
