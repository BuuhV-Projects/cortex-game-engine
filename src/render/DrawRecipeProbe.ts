/**
 * Sonda de elegibilidade do desenho nativo (SPEC-0333, passo 0 da etapa (b)
 * do ADR-0330). Desligada por padrão; liga com `?drawRecipeProbe=1`.
 *
 * Pergunta que ela responde ANTES de escrever o C++: de cada draw do quadro,
 * quantos o host poderia reproduzir a partir da receita gravada sem mudar a
 * imagem — e, dos que não, por quê. É o teto de ganho da etapa (b).
 *
 * Critério (SPEC-0333): o `three` não refez o objeto neste quadro, ele não se
 * moveu, o material não tem nó animado, não é instanciado/skinned/morph/
 * batched/transparente, e todo nó de update por OBJETO deriva só da matriz de
 * mundo (lista branca do `ModelNode`).
 */
import { modelNormalMatrix, modelWorldMatrixInverse } from 'three/tsl';
import { debug } from '../core/debug.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'drawRecipeProbe=';
/** `NodeUpdateType.OBJECT` do three. */
const UPDATE_OBJECT = 'object';
/** Quadros por relato. */
const REPORT_FRAMES = 300;
const MATRIX_ELEMENTS = 16;
/** Escopos do `ModelNode` que dependem só da matriz de mundo (SPEC-0333). */
const ESCOPOS_DA_MATRIZ = new Set(['worldMatrix', 'position', 'scale', 'direction', 'radius']);

/** Motivos, na ordem em que são testados (o primeiro que bate conta). */
export const RECIPE_REASONS = [
  'elegivel',
  'refeito',
  'moveu',
  'no-animado',
  'tipo',
  'transparente',
  'no-de-objeto',
] as const;
type Motivo = (typeof RECIPE_REASONS)[number];

interface NoLike {
  type?: string;
  scope?: string;
  getUpdateType(): string;
}

interface RoLike {
  object: {
    matrixWorld: { elements: ArrayLike<number> };
    isInstancedMesh?: boolean;
    isSkinnedMesh?: boolean;
    isBatchedMesh?: boolean;
    morphTargetInfluences?: unknown;
  };
  material: { transparent?: boolean };
  getMonitor(): { hasNode: boolean; hasAnimation: boolean };
  getNodeBuilderState(): { updateNodes: NoLike[]; updateBeforeNodes: NoLike[]; updateAfterNodes: NoLike[] };
}

/** `true` quando todo nó de update por objeto deriva só da matriz de mundo. */
export function objectNodesFromMatrixOnly(ro: RoLike): boolean {
  const estado = ro.getNodeBuilderState();
  for (const n of estado.updateBeforeNodes) if ((n as { getUpdateBeforeType?: () => string }).getUpdateBeforeType?.() === UPDATE_OBJECT) return false;
  for (const n of estado.updateAfterNodes) if ((n as { getUpdateAfterType?: () => string }).getUpdateAfterType?.() === UPDATE_OBJECT) return false;
  for (const n of estado.updateNodes) {
    if (n.getUpdateType() !== UPDATE_OBJECT) continue;
    if (n === (modelNormalMatrix as unknown) || n === (modelWorldMatrixInverse as unknown)) continue;
    if (n.type === 'ModelNode' && ESCOPOS_DA_MATRIZ.has(n.scope ?? '')) continue;
    return false;
  }
  return true;
}

/** Instala a sonda; `null` quando desligada ou o `three` não tem a forma esperada. */
export function installDrawRecipeProbe(renderer: object): { commitFrame(): void; uninstall(): void } | null {
  if (!queryFlagRequested(QUERY_KEY, false)) return null;
  const r = renderer as { _nodes?: Record<string, unknown>; backend?: Record<string, unknown> };
  const nodes = r._nodes;
  const backend = r.backend;
  const needsRefresh = nodes?.['needsRefresh'] as ((ro: RoLike) => boolean) | undefined;
  const draw = backend?.['draw'] as ((ro: RoLike, info: unknown) => void) | undefined;
  if (!nodes || !backend || typeof needsRefresh !== 'function' || typeof draw !== 'function') return null;

  const refeitos = new WeakSet<object>();
  const matrizes = new WeakMap<object, Float64Array>();
  const doObjeto = new WeakMap<object, boolean>();
  const contagem = new Map<Motivo, number>(RECIPE_REASONS.map((m) => [m, 0]));
  let quadros = 0;

  nodes['needsRefresh'] = function (this: unknown, ro: RoLike): boolean {
    const sim = needsRefresh.call(this, ro);
    if (sim) refeitos.add(ro);
    else refeitos.delete(ro);
    return sim;
  };

  const classificar = (ro: RoLike): Motivo => {
    const o = ro.object;
    // Moveu = matriz diferente da do último draw dele.
    let anterior = matrizes.get(ro);
    const atual = o.matrixWorld.elements;
    let moveu = anterior === undefined;
    if (anterior === undefined) {
      anterior = new Float64Array(MATRIX_ELEMENTS);
      matrizes.set(ro, anterior);
    }
    for (let i = 0; i < MATRIX_ELEMENTS; i++) {
      if (anterior[i] !== atual[i]) {
        moveu = true;
        anterior[i] = atual[i]!;
      }
    }
    if (refeitos.has(ro)) return 'refeito';
    if (moveu) return 'moveu';
    const monitor = ro.getMonitor();
    if (monitor.hasNode || monitor.hasAnimation) return 'no-animado';
    if (o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.morphTargetInfluences) return 'tipo';
    if (ro.material.transparent) return 'transparente';
    let soMatriz = doObjeto.get(ro);
    if (soMatriz === undefined) {
      soMatriz = objectNodesFromMatrixOnly(ro);
      doObjeto.set(ro, soMatriz);
    }
    return soMatriz ? 'elegivel' : 'no-de-objeto';
  };

  backend['draw'] = function (this: unknown, ro: RoLike, i: unknown): void {
    const motivo = classificar(ro);
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
    draw.call(this, ro, i);
  };

  debug('perf', '[drawRecipe] sonda instalada');
  return {
    commitFrame(): void {
      if (++quadros % REPORT_FRAMES !== 0) return;
      const partes = RECIPE_REASONS.map((m) => `${m}=${((contagem.get(m) ?? 0) / REPORT_FRAMES).toFixed(1)}`);
      debug('perf', `[drawRecipe] por quadro: ${partes.join(' ')}`);
      for (const m of RECIPE_REASONS) contagem.set(m, 0);
    },
    uninstall(): void {
      nodes['needsRefresh'] = needsRefresh;
      backend['draw'] = draw;
    },
  };
}
