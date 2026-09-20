/**
 * Cessão de frame (ADR-0218 / SPEC-0219): o contrato é ceder por ORÇAMENTO DE
 * TEMPO, não por item — ceder a cada item serializaria a carga no vsync — e ser
 * inofensivo onde não existe frame (Node/testes).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FrameBudget,
  nextFrame,
  yieldOnBudget,
  frameBudgetExpired,
  resetFrameBudget,
  beginLoadingScope,
  endLoadingScope,
  inLoadingScope,
  isSplashActive,
} from '../../src/core/frameYield.js';

/** Instala um `requestAnimationFrame` de mentira que conta as cessões. */
function fakeRaf(): { count: () => number; restore: () => void } {
  let calls = 0;
  const original = (globalThis as Record<string, unknown>)['requestAnimationFrame'];
  (globalThis as Record<string, unknown>)['requestAnimationFrame'] = (cb: () => void): number => {
    calls++;
    setTimeout(cb, 0);
    return calls;
  };
  return {
    count: () => calls,
    restore: () => {
      if (original === undefined) delete (globalThis as Record<string, unknown>)['requestAnimationFrame'];
      else (globalThis as Record<string, unknown>)['requestAnimationFrame'] = original;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('nextFrame', () => {
  it('resolve na hora quando não existe requestAnimationFrame', async () => {
    expect((globalThis as Record<string, unknown>)['requestAnimationFrame']).toBeUndefined();
    await expect(nextFrame()).resolves.toBeUndefined();
  });

  it('espera o rAF quando ele existe', async () => {
    const raf = fakeRaf();
    try {
      await nextFrame();
      expect(raf.count()).toBe(1);
    } finally {
      raf.restore();
    }
  });
});

describe('FrameBudget', () => {
  it('não cede antes de estourar o orçamento', async () => {
    const raf = fakeRaf();
    try {
      const budget = new FrameBudget(10_000); // orçamento que não estoura no teste
      for (let i = 0; i < 50; i++) await budget.maybeYield();
      expect(raf.count()).toBe(0);
      expect(budget.expired).toBe(false);
    } finally {
      raf.restore();
    }
  });

  it('cede uma vez por fatia, não por item', async () => {
    const raf = fakeRaf();
    const budget = new FrameBudget(100);
    let agora = 1_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => agora);
    try {
      budget.reset();
      // 10 itens dentro da mesma fatia: nenhuma cessão
      for (let i = 0; i < 10; i++) await budget.maybeYield();
      expect(raf.count()).toBe(0);
      // passou a fatia: cede UMA vez, e a próxima já não cede
      agora += 150;
      expect(budget.expired).toBe(true);
      await budget.maybeYield();
      await budget.maybeYield();
      expect(raf.count()).toBe(1);
    } finally {
      spy.mockRestore();
      raf.restore();
    }
  });

  it('reset adia a próxima cessão', async () => {
    let agora = 5_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => agora);
    try {
      const budget = new FrameBudget(100);
      agora += 150;
      expect(budget.expired).toBe(true);
      budget.reset();
      expect(budget.expired).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('sem rAF, maybeYield não trava nem lança', async () => {
    let agora = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => agora);
    try {
      const budget = new FrameBudget(10);
      agora += 100;
      await expect(budget.maybeYield()).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('escopo de carregamento', () => {
  afterEach(() => {
    while (inLoadingScope()) endLoadingScope();
    delete (globalThis as Record<string, unknown>)['__cortexSplashActive'];
  });

  it('não cede fora de um escopo de carga', async () => {
    const raf = fakeRaf();
    let agora = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (agora += 1000));
    try {
      expect(inLoadingScope()).toBe(false);
      await yieldOnBudget();
      await yieldOnBudget();
      expect(raf.count()).toBe(0); // fora de carga, ceder renderizaria a cena inteira
    } finally {
      spy.mockRestore();
      raf.restore();
    }
  });

  it('cede dentro do escopo quando o orçamento estoura', async () => {
    const raf = fakeRaf();
    let agora = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (agora += 1000));
    try {
      beginLoadingScope();
      resetFrameBudget(); // sincroniza o orçamento com o relógio de mentira
      expect(inLoadingScope()).toBe(true);
      await yieldOnBudget();
      expect(raf.count()).toBe(1);
    } finally {
      spy.mockRestore();
      raf.restore();
    }
  });

  it('escopos aninhados só fecham no último', () => {
    beginLoadingScope();
    beginLoadingScope();
    endLoadingScope();
    expect(inLoadingScope()).toBe(true);
    endLoadingScope();
    expect(inLoadingScope()).toBe(false);
  });

  it('usa fatia curta com a splash no ar e longa sem ela', () => {
    let agora = 10_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => agora);
    try {
      resetFrameBudget();
      agora += 100; // passou de 30ms (splash) mas não de 250ms (carregamento)
      expect(frameBudgetExpired()).toBe(false);
      (globalThis as Record<string, unknown>)['__cortexSplashActive'] = (): boolean => true;
      expect(isSplashActive()).toBe(true);
      expect(frameBudgetExpired()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('sem host nativo, não há splash', () => {
    expect(isSplashActive()).toBe(false);
  });
});
