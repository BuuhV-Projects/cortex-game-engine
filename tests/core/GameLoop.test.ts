/**
 * Testes unitários para GameLoop (src/core/GameLoop.ts)
 * Roda em Node.js via vitest — sem requestAnimationFrame disponível,
 * portanto o fallback setInterval é exercitado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '../../src/core/GameLoop.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Espera N ms reais (útil para testes baseados em timer real). */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─── testes ──────────────────────────────────────────────────────────────────

describe('GameLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Estado inicial ──────────────────────────────────────────────────────

  it('começa com isRunning=false e isPaused=false', () => {
    const loop = new GameLoop({ onUpdate: vi.fn() });
    expect(loop.isRunning).toBe(false);
    expect(loop.isPaused).toBe(false);
  });

  // ── start / stop ────────────────────────────────────────────────────────

  it('start() define isRunning=true', () => {
    const loop = new GameLoop({ onUpdate: vi.fn() });
    loop.start();
    expect(loop.isRunning).toBe(true);
    loop.stop();
  });

  it('start() idempotente — segunda chamada não tem efeito', () => {
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate, fixedStep: 50 });
    loop.start();
    loop.start(); // segunda chamada
    vi.advanceTimersByTime(50);
    // deve ter sido chamado apenas uma vez (um único setInterval ativo)
    expect(onUpdate).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('stop() define isRunning=false e para chamadas ao onUpdate', () => {
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate, fixedStep: 50 });
    loop.start();
    vi.advanceTimersByTime(50);
    loop.stop();
    const countAfterStop = onUpdate.mock.calls.length;
    vi.advanceTimersByTime(200); // avança mais; não deve chamar onUpdate
    expect(onUpdate).toHaveBeenCalledTimes(countAfterStop);
    expect(loop.isRunning).toBe(false);
  });

  // ── pause / resume ──────────────────────────────────────────────────────

  it('pause() define isPaused=true e suspende onUpdate', () => {
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate, fixedStep: 50 });
    loop.start();
    vi.advanceTimersByTime(50);
    loop.pause();
    const countAtPause = onUpdate.mock.calls.length;
    vi.advanceTimersByTime(200);
    expect(onUpdate).toHaveBeenCalledTimes(countAtPause); // sem novas chamadas
    expect(loop.isPaused).toBe(true);
    loop.stop();
  });

  it('resume() após pause() retoma onUpdate', () => {
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate, fixedStep: 50 });
    loop.start();
    vi.advanceTimersByTime(50);
    loop.pause();
    const countAtPause = onUpdate.mock.calls.length;
    loop.resume();
    vi.advanceTimersByTime(100);
    expect(onUpdate.mock.calls.length).toBeGreaterThan(countAtPause);
    expect(loop.isPaused).toBe(false);
    loop.stop();
  });

  it('pause() sem efeito se já pausado', () => {
    const loop = new GameLoop({ onUpdate: vi.fn(), fixedStep: 50 });
    loop.start();
    loop.pause();
    expect(() => loop.pause()).not.toThrow();
    loop.stop();
  });

  it('resume() sem efeito se não estiver pausado', () => {
    const loop = new GameLoop({ onUpdate: vi.fn(), fixedStep: 50 });
    loop.start();
    expect(() => loop.resume()).not.toThrow();
    loop.stop();
  });

  it('resume() sem efeito se loop não estiver rodando', () => {
    const loop = new GameLoop({ onUpdate: vi.fn() });
    expect(() => loop.resume()).not.toThrow();
    expect(loop.isRunning).toBe(false);
  });

  // ── onUpdate recebe deltaTime positivo ─────────────────────────────────

  it('onUpdate é chamado com deltaTime > 0', () => {
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate, fixedStep: 50 });
    loop.start();
    vi.advanceTimersByTime(50);
    loop.stop();
    expect(onUpdate).toHaveBeenCalled();
    const [deltaTime] = onUpdate.mock.calls[0] as [number];
    expect(deltaTime).toBeGreaterThan(0);
  });

  it('deltaTime é limitado a 100 ms num hitch gigante (anti-tunneling, ADR-0118)', () => {
    // Um frame pode demorar QUALQUER tempo (GC, background, máquina lenta).
    // Sem o clamp, a física integra um passo gigante e o personagem atravessa
    // o chão (respawn infinito no export nativo a <9 fps).
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate, fixedStep: 50 });
    loop.start();
    vi.advanceTimersByTime(50); // tick normal (dt ~50)
    const before = onUpdate.mock.calls.length;
    // Hitch: o relógio salta 5 s até o próximo tick do interval.
    const frozen = performance.now() + 5000;
    const spy = vi.spyOn(performance, 'now').mockReturnValue(frozen);
    vi.advanceTimersByTime(50);
    spy.mockRestore();
    const dt = (onUpdate.mock.calls[before] as [number])[0];
    expect(dt).toBe(100); // clamp: nunca repassa o salto inteiro
    loop.stop();
  });

  // ── onFixedUpdate ───────────────────────────────────────────────────────

  it('onFixedUpdate é chamado com o passo fixo configurado', () => {
    const onFixedUpdate = vi.fn();
    const STEP = 100;
    const loop = new GameLoop({ onUpdate: vi.fn(), onFixedUpdate, fixedStep: STEP });
    loop.start();
    // Avança 300 ms → deve disparar fixedUpdate ~ 3 vezes (depende de como o
    // setInterval acumula — ao menos 2 invocações são certas)
    vi.advanceTimersByTime(300);
    loop.stop();
    expect(onFixedUpdate).toHaveBeenCalled();
    // Cada chamada recebe exatamente o fixedStep
    for (const call of onFixedUpdate.mock.calls) {
      expect(call[0]).toBe(STEP);
    }
  });

  it('sem onFixedUpdate configurado não lança erro', () => {
    const loop = new GameLoop({ onUpdate: vi.fn(), fixedStep: 50 });
    loop.start();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    loop.stop();
  });

  // ── fixedStep padrão ────────────────────────────────────────────────────

  it('fixedStep padrão é ~16.67 ms (1000/60)', () => {
    // Testa indiretamente: o setInterval usa fixedStep como intervalo.
    // Se o padrão for 16.67 ms, em 50 ms deve haver ~3 ticks.
    const onUpdate = vi.fn();
    const loop = new GameLoop({ onUpdate }); // sem fixedStep explícito
    loop.start();
    vi.advanceTimersByTime(50);
    loop.stop();
    expect(onUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
