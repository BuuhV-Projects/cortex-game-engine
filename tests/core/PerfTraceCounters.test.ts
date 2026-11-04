/**
 * A amostra do perf-trace carrega os campos de diagnóstico da SPEC-0688 (`sunShadow`, `renderServer`,
 * `uiUploads`, `alloc`) e o setBindGroup separado em `cpu.napiBindJs`/`cpu.napiBindReplay`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { PerfTrace } from '../../src/core/PerfTrace.js';
import { FrameProfiler } from '../../src/core/FrameProfiler.js';
import {
  resetTraceCounters,
  traceCountersActive,
  traceNativeRefusal,
  traceSunShadowHandedBack,
  traceUiUpload,
} from '../../src/core/perfTrace/traceCounters.js';

const g = globalThis as { __cortexPerfTrace?: unknown; __cortexNapiStats?: unknown };
/** Passa do intervalo de amostra (500 ms) num frame só. */
const ONE_SAMPLE_MS = 600;

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  cam.updateMatrixWorld(true);
  return cam;
}

afterEach(() => {
  delete g.__cortexPerfTrace;
  delete g.__cortexNapiStats;
  resetTraceCounters();
});

describe('PerfTrace — contadores de diagnóstico (SPEC-0688)', () => {
  it('sem a ponte do host os contadores ficam desligados', () => {
    new PerfTrace();
    expect(traceCountersActive()).toBe(false);
  });

  it('com a ponte, a amostra leva sunShadow, renderServer e uiUploads da janela', () => {
    const lines: string[] = [];
    g.__cortexPerfTrace = (line: string) => lines.push(line);
    const trace = new PerfTrace();
    traceSunShadowHandedBack('sem-espelho');
    traceNativeRefusal('skinned');
    traceUiUpload('label', 7, '12:00');
    trace.tick(ONE_SAMPLE_MS, new Scene(), camera(), new FrameProfiler(), null);
    const sample = JSON.parse(lines[0]!);
    expect(sample.sunShadow).toEqual({ drawn: 0, handedBack: 1, reason: 'sem-espelho' });
    expect(sample.renderServer.nativeTop).toEqual([{ reason: 'skinned', count: 1 }]);
    expect(sample.uiUploads).toEqual({ total: 1, top: [{ widget: 'label#7', count: 1, hint: '12:00' }] });
    trace.tick(ONE_SAMPLE_MS, new Scene(), camera(), new FrameProfiler(), null);
    const next = JSON.parse(lines[1]!);
    expect(next.sunShadow).toBeUndefined();
    expect(next.uiUploads).toBeUndefined();
  });

  it('separa o setBindGroup em JS e replay sem mudar o napiBind', () => {
    const lines: string[] = [];
    g.__cortexPerfTrace = (line: string) => lines.push(line);
    g.__cortexNapiStats = () => ({ setBindGroup: 900, setBindGroupJs: 300, setBindGroupReplay: 600 });
    new PerfTrace().tick(ONE_SAMPLE_MS, new Scene(), camera(), new FrameProfiler(), null);
    const cpu = JSON.parse(lines[0]!).cpu;
    expect(cpu.napiBind).toBe(900);
    expect(cpu.napiBindJs).toBe(300);
    expect(cpu.napiBindReplay).toBe(600);
  });

  it('host antigo (sem a separação): napiBindJs e napiBindReplay ficam ausentes', () => {
    const lines: string[] = [];
    g.__cortexPerfTrace = (line: string) => lines.push(line);
    g.__cortexNapiStats = () => ({ setBindGroup: 900 });
    new PerfTrace().tick(ONE_SAMPLE_MS, new Scene(), camera(), new FrameProfiler(), null);
    const cpu = JSON.parse(lines[0]!).cpu;
    expect(cpu.napiBind).toBe(900);
    expect(cpu).not.toHaveProperty('napiBindJs');
    expect(cpu).not.toHaveProperty('napiBindReplay');
  });
});
