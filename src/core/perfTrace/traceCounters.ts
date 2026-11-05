/**
 * **Contadores de diagnóstico do perf-trace** (SPEC-0688, item 5.0 do plano de desempenho).
 *
 * As fontes (sombra do sol nativa, RenderServer, NativeRenderer, UI, World) registram aqui o que aconteceu; o
 * {@link PerfTrace} drena a cada amostra com {@link drainTraceCounters} e grava os campos `sunShadow`,
 * `renderServer`, `uiUploads` e `alloc`.
 *
 * Só fica ativo quando o host registrou a ponte do trace: o `PerfTrace` liga em
 * {@link setTraceCountersActive}. Inativo, toda função de registro retorna na primeira linha, então fora do trace
 * o custo é uma comparação. Não depende de `cortexDebug=perf`.
 */
import type { Object3D } from 'three';
import { sceneNodeIdOf } from './sceneCensus.js';
import { readAllocatedBytes } from './hostStats.js';
import { MS_DECIMALS } from './sampleSections.js';
import type {
  AllocSample, RenderServerSample, SunShadowCascadeSample, SunShadowSample, TraceCounterFields, UiUploadsSample,
} from '../PerfTrace.js';

/** Quantas chaves entram nos top-N dos campos (motivos de recusa, widgets da UI). */
export const TRACE_TOP = 5;

/** Bytes por KB, e casas decimais dos KB na amostra. */
const BYTES_PER_KB = 1024;
const KB_DECIMALS = 1;

/** Tamanho máximo do texto de um label que vai como `hint` em `uiUploads`. */
export const UI_HINT_CHARS = 24;

let active = false;

/** Liga ou desliga o registro. O `PerfTrace` liga quando o host aceita trace. */
export function setTraceCountersActive(on: boolean): void {
  active = on;
}

/** O registro está ligado? Fontes com custo próprio (ler a alocação) perguntam antes. */
export function traceCountersActive(): boolean {
  return active;
}

/** Contagem por chave dentro de uma janela de amostra. */
export class Tally {
  private _counts = new Map<string, number>();
  private _total = 0;

  add(key: string, n = 1): void {
    this._counts.set(key, (this._counts.get(key) ?? 0) + n);
    this._total += n;
  }

  get total(): number {
    return this._total;
  }

  /** O total e as `limit` chaves maiores (empate: ordem alfabética), e zera a janela. */
  drain(limit: number): { total: number; top: [string, number][] } {
    const top = [...this._counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, limit);
    const total = this._total;
    this._counts.clear();
    this._total = 0;
    return { total, top };
  }
}

/** Os acumulados do `RenderServer.stats` que a amostra lê. */
export interface RenderServerCounters {
  fallback: number;
  refused: number;
  fbEnv: number;
}

const sun = { drawn: 0, handedBack: 0, reason: undefined as string | undefined, counts: undefined as string | undefined, pending: 0 };
let sunOffender: Object3D | undefined;
/** O último desenho de cada cascata da CSM nativa (SPEC-0690), e o que a última amostra publicou. */
const cascades: SunShadowCascadeSample[] = [];
let cascadeCount = 0;
let publishedCascades = '';
/** Draws nativos que amostraram a CSM na janela (SPEC-0690). */
let csmReceivers = 0;
let server: RenderServerCounters | null = null;
const serverBase: RenderServerCounters = { fallback: 0, refused: 0, fbEnv: 0 };
const nativeRefusals = new Tally();
const uiUploads = new Tally();
const uiHints = new Map<string, string>();
const systemAlloc = new Map<string, number>();
let lastAllocated: number | null = null;

/** O passe da sombra do sol redesenhou o mapa em C++. */
export function traceSunShadowDrawn(): void {
  if (!active) return;
  sun.drawn++;
}

/** O passe devolveu o mapa ao three: guarda o motivo, os `counts` e o ofensor desta recusa. */
export function traceSunShadowHandedBack(reason: string, counts?: string, offender?: Object3D): void {
  if (!active) return;
  sun.handedBack++;
  sun.reason = reason;
  sun.counts = counts;
  sunOffender = offender;
}

/** Geometrias de caster ainda pendentes no registro do passe de sombra neste quadro (ADR-0692): o aquecimento. */
export function traceShadowGeometryPending(pending: number): void {
  if (!active) return;
  sun.pending = pending;
}

/**
 * Uma cascata da CSM nativa foi desenhada ou recusada (SPEC-0690). Guarda só o último resultado de cada uma; a
 * amostra publica a lista quando algum valor mudou desde a anterior. `reason` só entra com `status === 'refused'`.
 * `ms` (tempo do `drawShadowPass`) é guardado já arredondado, para a comparação com a amostra anterior não ver ruído
 * abaixo da casa publicada.
 */
export function traceSunShadowCascade(
  index: number, status: string, reason: string | undefined, drawn: number, skipped: number, excluded: number, ms: number,
): void {
  if (!active) return;
  const shown = status === 'refused' ? `refused:${reason ?? ''}` : status;
  const shownMs = round(ms, MS_DECIMALS);
  const slot = cascades[index];
  if (slot === undefined) cascades[index] = { status: shown, drawn, skipped, excluded, ms: shownMs };
  else {
    slot.status = shown;
    slot.drawn = drawn;
    slot.skipped = skipped;
    slot.excluded = excluded;
    slot.ms = shownMs;
  }
  if (index >= cascadeCount) cascadeCount = index + 1;
}

/** `count` draws nativos amostraram a CSM neste quadro (SPEC-0690); a amostra publica a soma da janela. */
export function traceCsmReceivers(count: number): void {
  if (!active) return;
  csmReceivers += count;
}

/**
 * O `RenderServer` registra o próprio `stats` ao nascer. Vale o último (há um por renderer); a amostra publica o
 * delta desde a anterior. Registrar não custa nada, então não depende de o trace estar ativo.
 */
export function traceRegisterRenderServer(stats: RenderServerCounters): void {
  server = stats;
  serverBase.fallback = stats.fallback;
  serverBase.refused = stats.refused;
  serverBase.fbEnv = stats.fbEnv;
}

/** O `NativeRenderer` recusou um objeto por `reason`. */
export function traceNativeRefusal(reason: string): void {
  if (!active) return;
  nativeRefusals.add(reason);
}

/** A UI mandou pixels novos de um widget à GPU. `hint` = o texto do label, para achar o widget. */
export function traceUiUpload(kind: 'label' | 'canvas' | 'image', widgetId: number, hint?: string): void {
  if (!active) return;
  const key = `${kind}#${widgetId}`;
  uiUploads.add(key);
  if (hint !== undefined) uiHints.set(key, hint.length > UI_HINT_CHARS ? hint.slice(0, UI_HINT_CHARS) : hint);
}

/** O `World` soma os bytes que um sistema alocou num `update`. */
export function traceSystemAllocation(name: string, bytes: number): void {
  if (!active) return;
  systemAlloc.set(name, (systemAlloc.get(name) ?? 0) + bytes);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toKB(bytes: number): number {
  return round(bytes / BYTES_PER_KB, KB_DECIMALS);
}

/** As cascatas da janela, só quando algum valor mudou desde a última amostra publicada. */
function drainCascades(): SunShadowCascadeSample[] | undefined {
  if (cascadeCount === 0) return undefined;
  const list = cascades.slice(0, cascadeCount).map((c) => ({ ...c }));
  const key = JSON.stringify(list);
  if (key === publishedCascades) return undefined;
  publishedCascades = key;
  return list;
}

function drainSunShadow(): SunShadowSample | undefined {
  const changed = drainCascades();
  const receivers = csmReceivers;
  csmReceivers = 0;
  if (sun.drawn + sun.handedBack === 0 && changed === undefined && receivers === 0) return undefined;
  const out: SunShadowSample = { drawn: sun.drawn, handedBack: sun.handedBack };
  if (receivers > 0) out.csmReceivers = receivers;
  if (sun.reason !== undefined) out.reason = sun.reason;
  if (sun.counts) out.counts = sun.counts;
  if (sun.pending > 0) out.pendingGeometry = sun.pending;
  if (sunOffender) out.offender = { name: sunOffender.name, id: sunOffender.id, node: sceneNodeIdOf(sunOffender) };
  if (changed !== undefined) out.cascades = changed;
  sun.drawn = 0;
  sun.handedBack = 0;
  sun.reason = undefined;
  sun.counts = undefined;
  sunOffender = undefined;
  return out;
}

function drainRenderServer(): RenderServerSample | undefined {
  const refusals = nativeRefusals.drain(TRACE_TOP);
  if (!server && refusals.total === 0) return undefined;
  const out: RenderServerSample = {
    fallback: server ? server.fallback - serverBase.fallback : 0,
    refused: server ? server.refused - serverBase.refused : 0,
    fbEnv: server ? server.fbEnv - serverBase.fbEnv : 0,
    nativeRefused: refusals.total,
    nativeTop: refusals.top.map(([reason, count]) => ({ reason, count })),
  };
  if (server) traceRegisterRenderServer(server);
  return out;
}

function drainUiUploads(): UiUploadsSample | undefined {
  const uploads = uiUploads.drain(TRACE_TOP);
  if (uploads.total === 0) return undefined;
  const top = uploads.top.map(([widget, count]) => {
    const hint = uiHints.get(widget);
    return hint !== undefined ? { widget, count, hint } : { widget, count };
  });
  uiHints.clear();
  return { total: uploads.total, top };
}

function drainAlloc(): AllocSample | undefined {
  const out: AllocSample = {};
  const now = readAllocatedBytes();
  if (now !== null && lastAllocated !== null) out.windowKB = toKB(now - lastAllocated);
  lastAllocated = now;
  if (systemAlloc.size > 0) {
    const sysKB: Record<string, number> = {};
    systemAlloc.forEach((bytes, name) => {
      sysKB[name] = toKB(bytes);
    });
    systemAlloc.clear();
    out.sysKB = sysKB;
  }
  return out.windowKB !== undefined || out.sysKB ? out : undefined;
}

/** Os campos da janela que fecha, e zera tudo para a próxima. Só os que têm o que dizer. */
export function drainTraceCounters(): TraceCounterFields {
  const out: TraceCounterFields = {};
  const sunShadow = drainSunShadow();
  if (sunShadow) out.sunShadow = sunShadow;
  const renderServer = drainRenderServer();
  if (renderServer) out.renderServer = renderServer;
  const ui = drainUiUploads();
  if (ui) out.uiUploads = ui;
  const alloc = drainAlloc();
  if (alloc) out.alloc = alloc;
  return out;
}

/** Zera tudo e desliga — só para teste. */
export function resetTraceCounters(): void {
  active = false;
  drainTraceCounters();
  server = null;
  lastAllocated = null;
  cascades.length = 0;
  cascadeCount = 0;
  publishedCascades = '';
  csmReceivers = 0;
  sun.pending = 0;
}
