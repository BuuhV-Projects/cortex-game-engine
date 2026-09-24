/**
 * Teto de quadros com alvo acumulado (ADR-0257).
 *
 * O caso que importa é o do monitor do dev: 75 Hz com vsync. Ali uma
 * implementação ingênua ("pula se passou menos de 1/maxFps desde o último
 * frame") entrega METADE da taxa pedida, sem aviso — e o teste principal existe
 * para pegar exatamente essa regressão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/debug.js', () => ({ debug: vi.fn() }));

import { FrameCap } from '../../src/core/GameLoop.js';
import { debug } from '../../src/core/debug.js';

const REFRESH_75_MS = 1000 / 75;
const SECONDS = 3;

/** Simula os callbacks de vsync e devolve os instantes dos frames admitidos. */
function run(cap: FrameCap, intervalMs: number, seconds = SECONDS, jitterMs = 0): number[] {
  const admitted: number[] = [];
  const frames = Math.round((seconds * 1000) / intervalMs);
  for (let i = 0; i <= frames; i++) {
    // Jitter alternado e determinístico: sem aleatoriedade no teste.
    const t = i * intervalMs + (i % 2 === 0 ? jitterMs : -jitterMs);
    if (cap.admit(t)) admitted.push(t);
  }
  return admitted;
}

function fps(admitted: number[]): number {
  return (admitted.length - 1) / ((admitted.at(-1)! - admitted[0]!) / 1000);
}

describe('FrameCap', () => {
  beforeEach(() => vi.mocked(debug).mockClear());

  it('sem teto admite todo frame', () => {
    const cap = new FrameCap();
    expect(run(cap, REFRESH_75_MS)).toHaveLength(Math.round((SECONDS * 1000) / REFRESH_75_MS) + 1);
  });

  it('teto 60 num monitor de 75 Hz entrega 60, não 37,5', () => {
    // A versão por delta desde o último frame pula todo vsync de 13,3 ms
    // (13,3 < 16,7) e cai para um frame a cada dois = 37,5 fps.
    const got = fps(run(new FrameCap(60), REFRESH_75_MS));
    expect(got).toBeGreaterThan(59);
    expect(got).toBeLessThan(61);
  });

  it('teto igual ao refresh não pula frame por jitter do vsync', () => {
    const all = Math.round((SECONDS * 1000) / REFRESH_75_MS) + 1;
    expect(run(new FrameCap(75), REFRESH_75_MS, SECONDS, 0.3)).toHaveLength(all);
  });

  it('teto divisor do refresh dá frames de duração igual', () => {
    const admitted = run(new FrameCap(37.5), REFRESH_75_MS);
    const gaps = admitted.slice(1).map((t, i) => t - admitted[i]!);
    for (const g of gaps) expect(g).toBeCloseTo(2 * REFRESH_75_MS, 5);
  });

  it('depois de uma travada ressincroniza em vez de soltar uma rajada', () => {
    const cap = new FrameCap(30);
    cap.admit(0);
    cap.admit(1000 / 30);
    // Travada de meio segundo, depois vsyncs a 75 Hz.
    const resumed: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t = 600 + i * REFRESH_75_MS;
      if (cap.admit(t)) resumed.push(t);
    }
    // A 30 fps, 10 vsyncs de 13,3 ms (133 ms) cabem 4 frames, não 10.
    expect(resumed.length).toBeLessThanOrEqual(5);
  });

  it('estima o refresh do monitor pelos primeiros frames', () => {
    const cap = new FrameCap();
    expect(cap.refreshHz).toBeNull();
    run(cap, REFRESH_75_MS, 1);
    expect(cap.refreshHz).toBeCloseTo(75, 0);
  });

  it('avisa quando o teto não divide o refresh', () => {
    run(new FrameCap(60), REFRESH_75_MS, 1);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(vi.mocked(debug).mock.calls[0]![1]).toMatch(/75\.0, 37\.5, 25\.0/);
  });

  it('não avisa quando o teto é divisor do refresh', () => {
    run(new FrameCap(37.5), REFRESH_75_MS, 1);
    expect(debug).not.toHaveBeenCalled();
  });

  it('trocar o teto em runtime vale no próximo frame', () => {
    const cap = new FrameCap(30);
    run(cap, REFRESH_75_MS, 1);
    cap.maxFps = 0;
    expect(cap.admit(2000)).toBe(true);
    expect(cap.admit(2000 + REFRESH_75_MS)).toBe(true);
  });
});
