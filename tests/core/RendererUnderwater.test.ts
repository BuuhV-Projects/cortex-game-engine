/**
 * Roteamento do efeito embaixo d'água no `Renderer` (SPEC-0726): com o efeito
 * desligado o render é o direto de sempre; no host nativo o estado vai ao
 * `__cortexUnderwater` só quando muda e o render continua direto (o efeito é do
 * blit do host).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const spies = {
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  render: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
  init: vi.fn().mockResolvedValue(undefined),
};

vi.mock('three/webgpu', () => ({
  WebGPURenderer: vi.fn(function (this: Record<string, unknown>) {
    Object.assign(this, spies);
    return this;
  }),
}));

/** Caminho do navegador simulado: o `UnderwaterPass` real precisa de GPU. */
const browserPath = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/core/UnderwaterPass.js', async (original) => {
  const mod = await original<typeof import('../../src/core/UnderwaterPass.js')>();
  class FakePass extends mod.UnderwaterPass {
    override render(): boolean {
      if (!this.state || (globalThis as { __cortexUnderwater?: unknown }).__cortexUnderwater) return false;
      browserPath.calls++;
      return true;
    }
  }
  return { ...mod, UnderwaterPass: FakePass };
});

import { Renderer } from '../../src/core/Renderer.js';

const scene = {} as import('three').Scene;
const camera = {} as import('three').Camera;

async function ready(): Promise<Renderer> {
  const r = new Renderer({ canvas: {} as HTMLCanvasElement, width: 800, height: 600 });
  await r.init();
  return r;
}

describe('Renderer.setUnderwater', () => {
  beforeEach(() => {
    Object.values(spies).forEach((s) => s.mockClear());
    browserPath.calls = 0;
    vi.stubGlobal('navigator', { gpu: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('desligado: render direto, sem o caminho do efeito', async () => {
    const r = await ready();
    expect(r.underwater).toBeNull();
    r.render(scene, camera);
    expect(spies.render).toHaveBeenCalledTimes(1);
    expect(browserPath.calls).toBe(0);
  });

  it('ligado no navegador: desenha pelo caminho do efeito; amount 0 volta ao direto', async () => {
    const r = await ready();
    r.setUnderwater({ amount: 0.7, depth: 9 });
    expect(r.underwater?.amount).toBeCloseTo(0.7);
    expect(r.underwater?.brightness).toBeCloseTo(0.9);
    r.render(scene, camera);
    expect(browserPath.calls).toBe(1);
    expect(spies.render).not.toHaveBeenCalled();
    r.setUnderwater({ amount: 0 });
    expect(r.underwater).toBeNull();
    r.render(scene, camera);
    expect(spies.render).toHaveBeenCalledTimes(1);
  });

  it('no host: manda ao __cortexUnderwater só quando muda e renderiza direto', async () => {
    const host = vi.fn();
    vi.stubGlobal('__cortexUnderwater', host);
    const r = await ready();
    r.setUnderwater({ amount: 0 }); // já desligado: nada a mandar
    expect(host).not.toHaveBeenCalled();
    r.setUnderwater({ amount: 1, color: 0xff0000 });
    r.setUnderwater({ amount: 1, color: 0xff0000 }); // igual: não atravessa a ponte
    expect(host).toHaveBeenCalledTimes(1);
    expect(host.mock.calls[0][0]).toMatchObject({ amount: 1, r: 1, g: 0, b: 0 });
    r.render(scene, camera);
    expect(spies.render).toHaveBeenCalledTimes(1);
    expect(browserPath.calls).toBe(0);
    r.setUnderwater(null);
    expect(host).toHaveBeenCalledTimes(2);
    expect(host.mock.calls[1][0]).toBeNull();
  });
});
