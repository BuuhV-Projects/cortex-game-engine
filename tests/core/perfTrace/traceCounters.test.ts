/**
 * Contadores de diagnóstico do perf-trace (SPEC-0688): cada campo sai com o que aconteceu NA JANELA, zera ao
 * drenar e nada é registrado sem o trace ativo.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import {
  Tally,
  TRACE_TOP,
  UI_HINT_CHARS,
  drainTraceCounters,
  resetTraceCounters,
  setTraceCountersActive,
  traceNativeRefusal,
  traceRegisterRenderServer,
  traceSunShadowDrawn,
  traceSunShadowHandedBack,
  traceSystemAllocation,
  traceUiUpload,
} from '../../../src/core/perfTrace/traceCounters.js';

const g = globalThis as { __cortexAllocatedBytes?: () => number; __cortexGcStats?: () => unknown };

beforeEach(() => {
  resetTraceCounters();
  setTraceCountersActive(true);
});

afterEach(() => {
  resetTraceCounters();
  delete g.__cortexAllocatedBytes;
  delete g.__cortexGcStats;
});

describe('Tally', () => {
  it('devolve o total e as N chaves maiores, e zera ao drenar', () => {
    const t = new Tally();
    for (const [key, n] of [['a', 1], ['b', 5], ['c', 3], ['d', 3]] as const) t.add(key, n);
    expect(t.drain(3)).toEqual({ total: 12, top: [['b', 5], ['c', 3], ['d', 3]] });
    expect(t.drain(3)).toEqual({ total: 0, top: [] });
  });
});

describe('traceCounters', () => {
  it('inativo, não registra nada (custo zero fora do trace)', () => {
    setTraceCountersActive(false);
    traceSunShadowHandedBack('sem-espelho');
    traceNativeRefusal('skip');
    traceUiUpload('label', 1, 'x');
    traceSystemAllocation('Sys', 100);
    expect(drainTraceCounters()).toEqual({});
  });

  it('sunShadow: conta redesenhos e devoluções e guarda a última recusa com o ofensor', () => {
    const node = new Object3D();
    node.name = 'rua-3';
    node.userData['cortexSceneNode'] = true;
    const poste = new Object3D();
    poste.name = 'poste_07';
    node.add(poste);
    traceSunShadowDrawn();
    traceSunShadowHandedBack('sem-mapa');
    traceSunShadowHandedBack('divergente', 'instanced=4', poste);
    expect(drainTraceCounters().sunShadow).toEqual({
      drawn: 1,
      handedBack: 2,
      reason: 'divergente',
      counts: 'instanced=4',
      offender: { name: 'poste_07', id: poste.id, node: 'rua-3' },
    });
    expect(drainTraceCounters().sunShadow).toBeUndefined();
  });

  it('renderServer: publica o delta da janela e os 5 motivos de recusa mais frequentes', () => {
    const stats = { fallback: 10, refused: 50, fbEnv: 4 };
    traceRegisterRenderServer(stats);
    stats.fallback += 3;
    stats.refused += 7;
    stats.fbEnv += 2;
    const reasons = ['skinned', 'skinned', 'skinned', 'skip', 'skip', 'fog', 'a', 'b', 'c'];
    for (const r of reasons) traceNativeRefusal(r);
    const first = drainTraceCounters().renderServer!;
    expect(first.fallback).toBe(3);
    expect(first.refused).toBe(7);
    expect(first.fbEnv).toBe(2);
    expect(first.nativeRefused).toBe(reasons.length);
    expect(first.nativeTop).toHaveLength(TRACE_TOP);
    expect(first.nativeTop[0]).toEqual({ reason: 'skinned', count: 3 });
    expect(first.nativeTop[1]).toEqual({ reason: 'skip', count: 2 });
    stats.fallback += 1;
    expect(drainTraceCounters().renderServer).toEqual({ fallback: 1, refused: 0, fbEnv: 0, nativeRefused: 0, nativeTop: [] });
  });

  it('renderServer some sem servidor e sem recusa nativa', () => {
    expect(drainTraceCounters().renderServer).toBeUndefined();
  });

  it('uiUploads: conta por widget, guarda o texto curto e some sem upload', () => {
    const longo = 'x'.repeat(UI_HINT_CHARS + 10);
    traceUiUpload('label', 12, '00:41.2');
    traceUiUpload('label', 12, longo);
    traceUiUpload('canvas', 3);
    expect(drainTraceCounters().uiUploads).toEqual({
      total: 3,
      top: [
        { widget: 'label#12', count: 2, hint: 'x'.repeat(UI_HINT_CHARS) },
        { widget: 'canvas#3', count: 1 },
      ],
    });
    expect(drainTraceCounters().uiUploads).toBeUndefined();
  });

  it('alloc: KB da janela pelo leitor do host, por sistema, e nada na primeira amostra', () => {
    let bytes = 1_000_000;
    g.__cortexAllocatedBytes = () => bytes;
    expect(drainTraceCounters().alloc).toBeUndefined(); // primeira amostra: só a base
    bytes += 2048;
    traceSystemAllocation('NpcSystem', 1024);
    traceSystemAllocation('NpcSystem', 512);
    expect(drainTraceCounters().alloc).toEqual({ windowKB: 2, sysKB: { NpcSystem: 1.5 } });
  });

  it('alloc: em host antigo cai no gc.allocatedMB', () => {
    let mb = 10;
    g.__cortexGcStats = () => ({ allocatedMB: mb });
    drainTraceCounters();
    mb += 0.5;
    expect(drainTraceCounters().alloc).toEqual({ windowKB: 512 });
  });
});
