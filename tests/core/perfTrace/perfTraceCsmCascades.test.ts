/**
 * Campos da CSM nativa no perf-trace (SPEC-0690, item 6): o `ms` de cada cascata e o `csmReceivers` — quantos draws
 * nativos amostraram a CSM na janela.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  drainTraceCounters,
  resetTraceCounters,
  setTraceCountersActive,
  traceCsmReceivers,
  traceSunShadowCascade,
} from '../../../src/core/perfTrace/traceCounters.js';
import { countCsmReceiver, flushCsmReceivers } from '../../../src/render/native/frame/csmReceiverCount.js';

/** Casters desenhados e excluídos de exemplo. */
const DRAWN = 12;
const EXCLUDED = 1;

beforeEach(() => {
  resetTraceCounters();
  setTraceCountersActive(true);
  flushCsmReceivers(false);
});

afterEach(() => {
  flushCsmReceivers(false);
  resetTraceCounters();
});

describe('sunShadow.cascades[i].ms (SPEC-0690)', () => {
  it('publica o tempo do drawShadowPass de cada cascata, arredondado como os outros ms do trace', () => {
    traceSunShadowCascade(0, 'ok', undefined, DRAWN, 0, EXCLUDED, 1.2345);
    traceSunShadowCascade(1, 'refused', 'instanced', 0, 0, EXCLUDED, 0);
    expect(drainTraceCounters().sunShadow?.cascades).toEqual([
      { status: 'ok', drawn: DRAWN, skipped: 0, excluded: EXCLUDED, ms: 1.2 },
      { status: 'refused:instanced', drawn: 0, skipped: 0, excluded: EXCLUDED, ms: 0 },
    ]);
  });

  it('ruído abaixo da casa publicada não republica a lista', () => {
    traceSunShadowCascade(0, 'ok', undefined, DRAWN, 0, 0, 1.21);
    expect(drainTraceCounters().sunShadow?.cascades).toHaveLength(1);
    traceSunShadowCascade(0, 'ok', undefined, DRAWN, 0, 0, 1.24);
    expect(drainTraceCounters().sunShadow).toBeUndefined();
    traceSunShadowCascade(0, 'ok', undefined, DRAWN, 0, 0, 2);
    expect(drainTraceCounters().sunShadow?.cascades?.[0]?.ms).toBe(2);
  });
});

describe('sunShadow.csmReceivers (SPEC-0690)', () => {
  it('acumula na janela e zera depois do drain', () => {
    traceCsmReceivers(3);
    traceCsmReceivers(4);
    expect(drainTraceCounters().sunShadow).toEqual({ drawn: 0, handedBack: 0, csmReceivers: 7 });
    expect(drainTraceCounters().sunShadow).toBeUndefined();
  });

  it('fora do trace nada é contado', () => {
    setTraceCountersActive(false);
    traceCsmReceivers(5);
    setTraceCountersActive(true);
    expect(drainTraceCounters().sunShadow).toBeUndefined();
  });

  it('o contador do renderer só conta os quadros em que a CSM foi amostrada', () => {
    flushCsmReceivers(true); // o bloco escreveu a CSM com cascata ligada
    countCsmReceiver();
    countCsmReceiver();
    flushCsmReceivers(false); // fim do quadro; o próximo não amostra
    countCsmReceiver();
    flushCsmReceivers(false);
    expect(drainTraceCounters().sunShadow?.csmReceivers).toBe(2);
  });
});
