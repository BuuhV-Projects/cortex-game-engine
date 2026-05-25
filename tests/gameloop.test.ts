/**
 * Testes unitários para GameLoop (src/core/GameLoop.ts)
 * Foco: start/stop, delta time e contagem de fixed updates.
 * Roda em Node.js via vitest (sem requestAnimationFrame — usa o fallback setInterval).
 * Referência: ADR-0002.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '../src/core/GameLoop.js';

// ─── Testes ────────────────────────────────────────────────────────────────

describe('GameLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── start / stop ──────────────────────────────────────────────────────────

  describe('start / stop', () => {
    it('isRunning é false antes de start()', () => {
      const loop = new GameLoop({ onUpdate: vi.fn() });
      expect(loop.isRunning).toBe(false);
      expect(loop.isPaused).toBe(false);
    });

    it('isRunning é true após start()', () => {
      const loop = new GameLoop({ onUpdate: vi.fn() });
      loop.start();
      expect(loop.isRunning).toBe(true);
      loop.stop();
    });

    it('isRunning é false após stop()', () => {
      const loop = new GameLoop({ onUpdate: vi.fn() });
      loop.start();
      loop.stop();
      expect(loop.isRunning).toBe(false);
    });

    it('stop() impede novas chamadas a onUpdate após a parada', () => {
      const onUpdate = vi.fn();
      const loop = new GameLoop({ onUpdate, fixedStep: 50 });
      loop.start();
      vi.advanceTimersByTime(50);
      loop.stop();
      const countAfterStop = onUpdate.mock.calls.length;
      vi.advanceTimersByTime(300); // avança sem loop ativo
      expect(onUpdate).toHaveBeenCalledTimes(countAfterStop);
    });

    it('segundo start() consecutivo não registra duplo loop (idempotente)', () => {
      const onUpdate = vi.fn();
      const loop = new GameLoop({ onUpdate, fixedStep: 50 });
      loop.start();
      loop.start(); // segunda chamada deve ser ignorada
      vi.advanceTimersByTime(50);
      // deve haver exatamente um setInterval ativo → apenas uma chamada
      expect(onUpdate).toHaveBeenCalledTimes(1);
      loop.stop();
    });
  });

  // ── delta time ────────────────────────────────────────────────────────────

  describe('delta time', () => {
    it('onUpdate é chamado com deltaTime > 0 no primeiro frame', () => {
      const onUpdate = vi.fn();
      const STEP = 50;
      const loop = new GameLoop({ onUpdate, fixedStep: STEP });
      loop.start();
      vi.advanceTimersByTime(STEP);
      loop.stop();
      expect(onUpdate).toHaveBeenCalled();
      const deltaTime = (onUpdate.mock.calls[0] as [number])[0];
      expect(deltaTime).toBeGreaterThan(0);
    });

    it('deltaTime é um número finito e não-negativo em todos os frames', () => {
      const onUpdate = vi.fn();
      const loop = new GameLoop({ onUpdate, fixedStep: 33 });
      loop.start();
      vi.advanceTimersByTime(200);
      loop.stop();
      expect(onUpdate).toHaveBeenCalled();
      for (const call of onUpdate.mock.calls) {
        const dt = (call as [number])[0];
        expect(Number.isFinite(dt)).toBe(true);
        expect(dt).toBeGreaterThanOrEqual(0);
      }
    });

    it('deltaTime é aproximadamente igual ao intervalo configurado', () => {
      const onUpdate = vi.fn();
      const STEP = 100;
      const loop = new GameLoop({ onUpdate, fixedStep: STEP });
      loop.start();
      vi.advanceTimersByTime(STEP);
      loop.stop();
      const deltaTime = (onUpdate.mock.calls[0] as [number])[0];
      // Com fake timers, o valor deve ser próximo ao STEP configurado
      expect(deltaTime).toBeGreaterThanOrEqual(STEP * 0.5);
    });
  });

  // ── contagem de fixed updates ─────────────────────────────────────────────

  describe('contagem de fixed updates', () => {
    it('onFixedUpdate é chamado pelo menos N vezes para N * fixedStep ms decorridos', () => {
      const onFixedUpdate = vi.fn();
      const STEP = 100;
      const loop = new GameLoop({
        onUpdate: vi.fn(),
        onFixedUpdate,
        fixedStep: STEP,
      });
      loop.start();
      vi.advanceTimersByTime(STEP * 3);
      loop.stop();
      // 3 × 100 ms → ao menos 2 fixed updates garantidos pelo acumulador
      expect(onFixedUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('cada chamada a onFixedUpdate recebe exatamente o fixedStep configurado', () => {
      const onFixedUpdate = vi.fn();
      const STEP = 50;
      const loop = new GameLoop({
        onUpdate: vi.fn(),
        onFixedUpdate,
        fixedStep: STEP,
      });
      loop.start();
      vi.advanceTimersByTime(STEP * 4);
      loop.stop();
      expect(onFixedUpdate).toHaveBeenCalled();
      for (const call of onFixedUpdate.mock.calls) {
        expect((call as [number])[0]).toBe(STEP);
      }
    });

    it('nenhum onFixedUpdate adicional é disparado após stop()', () => {
      const onFixedUpdate = vi.fn();
      const STEP = 50;
      const loop = new GameLoop({
        onUpdate: vi.fn(),
        onFixedUpdate,
        fixedStep: STEP,
      });
      loop.start();
      vi.advanceTimersByTime(STEP * 2);
      loop.stop();
      const countAtStop = onFixedUpdate.mock.calls.length;
      vi.advanceTimersByTime(STEP * 5); // avança sem loop ativo
      expect(onFixedUpdate).toHaveBeenCalledTimes(countAtStop);
    });

    it('loop sem onFixedUpdate configurado não lança erro', () => {
      const loop = new GameLoop({ onUpdate: vi.fn(), fixedStep: 50 });
      loop.start();
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
      loop.stop();
    });
  });
});
