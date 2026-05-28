/**
 * Testes unitários para Renderer (src/core/Renderer.ts)
 *
 * Mocka `THREE.WebGLRenderer` (não disponível em Node sem WebGL) para
 * inspecionar a ordem e os argumentos das chamadas internas — em
 * particular o handshake de `setViewport` + `setScissor` + `setScissorTest`
 * usado por split-screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock de three.WebGLRenderer ──────────────────────────────────────────────

const rendererSpies = {
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  setViewport: vi.fn(),
  setScissor: vi.fn(),
  setScissorTest: vi.fn(),
  render: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
};

/** Instância do mock criada no construtor — usada nas asserts. */
let lastRendererInstance: Record<string, unknown> | null = null;

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: vi.fn(function (this: Record<string, unknown>) {
      Object.assign(this, rendererSpies);
      this.autoClear = true;
      lastRendererInstance = this;
      return this;
    }),
  };
});

// Import depois do mock — caso contrário pega a classe real.
import { Renderer } from '../../src/core/Renderer.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRenderer() {
  // Canvas fake — o mock do WebGLRenderer ignora o parâmetro de qualquer forma.
  const canvas = {} as HTMLCanvasElement;
  return new Renderer({ canvas, width: 800, height: 600 });
}

const fakeScene = {} as import('three').Scene;
const fakeCamera = {} as import('three').Camera;

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('Renderer', () => {
  beforeEach(() => {
    Object.values(rendererSpies).forEach((spy) => spy.mockClear());
    lastRendererInstance = null;
  });

  // ── Construção / configuração ──────────────────────────────────────────────

  it('seta o tamanho inicial', () => {
    makeRenderer();
    expect(rendererSpies.setSize).toHaveBeenCalledWith(800, 600);
  });

  it('seta autoClear=false (necessário para split-screen)', () => {
    makeRenderer();
    expect(lastRendererInstance?.autoClear).toBe(false);
  });

  // ── render() ───────────────────────────────────────────────────────────────

  it('render() limpa antes de renderizar', () => {
    const r = makeRenderer();
    r.render(fakeScene, fakeCamera);
    expect(rendererSpies.clear).toHaveBeenCalledOnce();
    expect(rendererSpies.render).toHaveBeenCalledOnce();
    // clear deve vir antes de render
    expect(rendererSpies.clear.mock.invocationCallOrder[0])
      .toBeLessThan(rendererSpies.render.mock.invocationCallOrder[0]);
  });

  // ── clear() ────────────────────────────────────────────────────────────────

  it('clear() delega para o WebGLRenderer.clear', () => {
    const r = makeRenderer();
    r.clear();
    expect(rendererSpies.clear).toHaveBeenCalledOnce();
  });

  // ── renderViewport() ───────────────────────────────────────────────────────

  it('renderViewport() configura viewport + scissor + scissor test e renderiza', () => {
    const r = makeRenderer();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });

    expect(rendererSpies.setViewport).toHaveBeenCalledWith(0, 0, 400, 600);
    expect(rendererSpies.setScissor).toHaveBeenCalledWith(0, 0, 400, 600);
    expect(rendererSpies.setScissorTest).toHaveBeenCalledWith(true);
    expect(rendererSpies.render).toHaveBeenCalledWith(fakeScene, fakeCamera);
  });

  it('renderViewport() desliga scissor test ao final', () => {
    const r = makeRenderer();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });

    const calls = rendererSpies.setScissorTest.mock.calls;
    expect(calls).toEqual([[true], [false]]);
  });

  it('renderViewport() NÃO chama clear (split-screen depende disso)', () => {
    const r = makeRenderer();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });
    expect(rendererSpies.clear).not.toHaveBeenCalled();
  });

  it('split-screen de 2 viewports: 1× clear + 2× setScissorTest(true) + 2× render', () => {
    const r = makeRenderer();
    r.clear();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });
    r.renderViewport(fakeScene, fakeCamera, { x: 400, y: 0, width: 400, height: 600 });

    expect(rendererSpies.clear).toHaveBeenCalledOnce();
    expect(rendererSpies.render).toHaveBeenCalledTimes(2);
    // Cada renderViewport liga e desliga o scissor test.
    expect(rendererSpies.setScissorTest.mock.calls).toEqual([
      [true], [false],
      [true], [false],
    ]);
  });

  // ── resize() ───────────────────────────────────────────────────────────────

  it('resize() atualiza dimensões e WebGLRenderer.setSize', () => {
    const r = makeRenderer();
    rendererSpies.setSize.mockClear();
    r.resize(1024, 768);
    expect(r.width).toBe(1024);
    expect(r.height).toBe(768);
    expect(rendererSpies.setSize).toHaveBeenCalledWith(1024, 768);
  });

  // ── dispose() ──────────────────────────────────────────────────────────────

  it('dispose() chama dispose do WebGLRenderer', () => {
    const r = makeRenderer();
    r.dispose();
    expect(rendererSpies.dispose).toHaveBeenCalledOnce();
  });
});
