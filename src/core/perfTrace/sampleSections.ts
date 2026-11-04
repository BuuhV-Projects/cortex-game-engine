/**
 * Blocos da amostra do perf-trace que leem fontes do quadro e escrevem no mapa `cpu`: ponte NAPI do host
 * (SPEC-0225/0252), fases do render (SPEC-0227), perfil por sistema (SPEC-0236) e a cobertura de material
 * (ADR-0237/SPEC-0238). Saíram do `PerfTrace.tick` (SPEC-0688) para o `PerfTrace.ts` caber em 500 linhas.
 * Módulo interno: não aparece em nenhuma assinatura pública.
 */
import type { Object3D } from 'three';
import type { RenderPhaseProbe } from '../RenderPhaseProbe.js';
import { describeMaterial, isDescribed, measureCoverage } from '../../render/MaterialDesc.js';
import { countDistinctPipelines } from '../../render/PipelineKey.js';
import { napiBridgeMs, napiStats } from './hostStats.js';

/** Casas decimais dos tempos (ms) na linha gravada. */
export const MS_DECIMALS = 1;

/**
 * Casas decimais das fases do render (SPEC-0227). Mais fino que `MS_DECIMALS`
 * de propósito: uma fase pode valer centésimos de ms por frame e ainda assim
 * dominar o custo POR OBJETO, que é a pergunta em jogo.
 */
export const PHASE_MS_DECIMALS = 3;

/** Casas decimais do custo do relógio (ns). */
const CLOCK_NS_DECIMALS = 1;

/** Arredonda pra `decimals` casas (evita linha cheia de ruído de ponto flutuante). */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Acumulados de criação de recursos de GPU do host (SPEC-0252). */
export interface BornTotals {
  pipelines: number;
  buffers: number;
  textures: number;
}

/**
 * Ponte NAPI do host no mapa `cpu` (`napi`, `napiWb`, `napiBind*`, `napiPipe`) e os acumulados de criação, que
 * ficam FORA do mapa de propósito: não são milissegundos.
 */
export function readHostSections(cpu: Record<string, number>): BornTotals | undefined {
  // Ponte NAPI do host (SPEC-0225). Entra no mesmo mapa porque é a mesma
  // pergunta — quanto do frame é isto — mas ATENÇÃO: não é uma seção nova e
  // sim um SUBCONJUNTO de `render`. Somar tudo contaria duas vezes.
  const napiMs = napiBridgeMs();
  if (napiMs !== null) cpu['napi'] = round(napiMs, MS_DECIMALS);
  // Contadores da ponte no mesmo mapa: a pergunta em aberto é se os
  // `writeBuffer` acompanham os draws (uniforme de objeto estático reescrito
  // todo frame) ou só os objetos que de fato se movem (SPEC-0225).
  const stats = napiStats();
  if (!stats) return undefined;
  cpu['napiWb'] = stats['writeBuffer'] ?? 0;
  cpu['napiBind'] = stats['setBindGroup'] ?? 0;
  // SPEC-0688: o mesmo total separado em chamada JS e replay em C++ do draw batch (host antigo: ausentes).
  if (stats['setBindGroupJs'] !== undefined) cpu['napiBindJs'] = stats['setBindGroupJs'];
  if (stats['setBindGroupReplay'] !== undefined) cpu['napiBindReplay'] = stats['setBindGroupReplay'];
  cpu['napiPipe'] = stats['setPipeline'] ?? 0;
  if (stats['bornPipelines'] === undefined) return undefined;
  return {
    pipelines: stats['bornPipelines'] ?? 0,
    buffers: stats['bornBuffers'] ?? 0,
    textures: stats['bornTextures'] ?? 0,
  };
}

/**
 * Fases do render (SPEC-0227): mesma regra do `napi` — são SUBCONJUNTOS de
 * `render`, não seções novas, e não se somam ao total. `rpCalls*` conta as
 * chamadas de topo, para separar "fase cara" de "fase chamada muitas vezes".
 */
export function readPhaseSections(cpu: Record<string, number>, phases: RenderPhaseProbe | null | undefined): void {
  if (!phases?.enabled) return;
  const phaseMs = phases.lastFrameMs();
  const phaseCalls = phases.lastFrameCalls();
  for (const [name, ms] of Object.entries(phaseMs)) {
    cpu[`rp${name[0].toUpperCase()}${name.slice(1)}`] = round(ms, PHASE_MS_DECIMALS);
  }
  for (const [name, calls] of Object.entries(phaseCalls)) {
    cpu[`rpCalls${name[0].toUpperCase()}${name.slice(1)}`] = calls;
  }
  // Custo e resolução do relógio: sem eles não dá para saber se um balde
  // pequeno é trabalho ou é o próprio instrumento (e um `clockResNs` de
  // ~1e6 denuncia que a SPEC-0226 não está de pé neste binário).
  // Nível 3: 1 = colaboradores internos embrulhados, 0 = não deu (baldes
  // internos zerados NÃO são "fase barata"); ausente = nível 3 não pedido.
  // M0 do ADR-0237: refazer x reaproveitar o trabalho por objeto.
  const refresh = phases.lastFrameRefresh();
  if (refresh.refresh + refresh.reuse > 0) {
    cpu['rpRefresh'] = refresh.refresh;
    cpu['rpReuse'] = refresh.reuse;
  }
  const internals = phases.internalsOk;
  if (internals !== null) cpu['rpInternals'] = internals ? 1 : 0;
  const clock = phases.clock;
  if (clock) {
    cpu['clockNs'] = round(clock.costNs, CLOCK_NS_DECIMALS);
    cpu['clockResNs'] = round(clock.resolutionNs, CLOCK_NS_DECIMALS);
  }
}

/**
 * Perfil por sistema do ECS (SPEC-0236): o `world` deixa de ser um bloco
 * só. Prefixo `sys` para não colidir com as seções do profiler de frame. Zera o mapa.
 */
export function readSystemSections(cpu: Record<string, number>, systemProfile: Map<string, number> | null | undefined): void {
  if (!systemProfile) return;
  for (const [nome, ms] of systemProfile) {
    cpu[`sys${nome}`] = round(ms, PHASE_MS_DECIMALS);
  }
  systemProfile.clear();
}

/**
 * Cobertura da descrição de material (M1 do ADR-0237) e quantos pipelines DISTINTOS a cena gera (passo 2 da
 * SPEC-0238). Contexto fixo porque layout de vértice e formato de alvo ainda não são catalogados — então o
 * número de pipelines é o PISO, não o total.
 */
export function materialCoverageEvent(
  scene: Object3D,
): { materialCoverage: ReturnType<typeof measureCoverage>; pipelines: ReturnType<typeof countDistinctPipelines> } {
  const materiais = new Set<never>();
  scene.traverse((obj) => {
    const mesh = obj as { material?: unknown };
    if (!mesh.material) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materiais.add(m as never);
  });
  const cobertura = measureCoverage(materiais);
  const descritos = [];
  for (const m of materiais) {
    const d = describeMaterial(m as never);
    if (isDescribed(d)) descritos.push(d);
  }
  const pipelines = countDistinctPipelines(descritos, { vertexLayoutId: 0, targetFormatId: 0 });
  return { materialCoverage: cobertura, pipelines };
}
