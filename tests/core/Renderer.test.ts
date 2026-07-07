/**
 * Testes unitários para Renderer (src/core/Renderer.ts)
 *
 * Mocka o `WebGPURenderer` de `three/webgpu` (não disponível em Node sem GPU)
 * para inspecionar a ordem e os argumentos das chamadas internas — em particular
 * o handshake de `setViewport` + `setScissor` + `setScissorTest` (split-screen)
 * e o init assíncrono (render/clear são no-op até `init()` resolver).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoToneMapping, ACESFilmicToneMapping } from 'three';

// ─── Mock do WebGPURenderer (three/webgpu) ─────────────────────────────────────

const rendererSpies = {
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  setViewport: vi.fn(),
  setScissor: vi.fn(),
  setScissorTest: vi.fn(),
  render: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
  init: vi.fn().mockResolvedValue(undefined),
};

/** Instância do mock criada no construtor — usada nas asserts. */
let lastRendererInstance: Record<string, unknown> | null = null;

vi.mock('three/webgpu', () => ({
  WebGPURenderer: vi.fn(function (this: Record<string, unknown>) {
    Object.assign(this, rendererSpies);
    this.autoClear = true;
    lastRendererInstance = this;
    return this;
  }),
}));

// Import depois do mock — caso contrário pega a classe real.
import { Renderer } from '../../src/core/Renderer.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRenderer() {
  const canvas = {} as HTMLCanvasElement;
  return new Renderer({ canvas, width: 800, height: 600 });
}

/** Cria o renderer e espera o init do backend (render/clear deixam de ser no-op). */
async function makeReadyRenderer() {
  const r = makeRenderer();
  await r.init();
  return r;
}

const fakeScene = {} as import('three').Scene;
const fakeCamera = {} as import('three').Camera;

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('Renderer', () => {
  beforeEach(() => {
    Object.values(rendererSpies).forEach((spy) => spy.mockClear());
    lastRendererInstance = null;
    // Simula um ambiente com WebGPU. O Renderer exige `navigator.gpu` (WebGPU
    // obrigatório); em Node `navigator` existe mas sem `.gpu`, então stubamos.
    vi.stubGlobal('navigator', { gpu: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('chama init() do backend no construtor', () => {
    makeRenderer();
    expect(rendererSpies.init).toHaveBeenCalledOnce();
  });

  // ── init assíncrono ──────────────────────────────────────────────────────────

  it('render() é no-op antes do init resolver', () => {
    const r = makeRenderer();
    r.render(fakeScene, fakeCamera);
    expect(rendererSpies.clear).not.toHaveBeenCalled();
    expect(rendererSpies.render).not.toHaveBeenCalled();
    expect(r.isReady).toBe(false);
  });

  it('fica pronto (isReady) após init()', async () => {
    const r = await makeReadyRenderer();
    expect(r.isReady).toBe(true);
  });

  // ── render() ───────────────────────────────────────────────────────────────

  it('render() limpa antes de renderizar (após init)', async () => {
    const r = await makeReadyRenderer();
    r.render(fakeScene, fakeCamera);
    expect(rendererSpies.clear).toHaveBeenCalledOnce();
    expect(rendererSpies.render).toHaveBeenCalledOnce();
    expect(rendererSpies.clear.mock.invocationCallOrder[0]!)
      .toBeLessThan(rendererSpies.render.mock.invocationCallOrder[0]!);
  });

  // ── clear() ────────────────────────────────────────────────────────────────

  it('clear() delega para o renderer (após init)', async () => {
    const r = await makeReadyRenderer();
    r.clear();
    expect(rendererSpies.clear).toHaveBeenCalledOnce();
  });

  // ── renderViewport() ───────────────────────────────────────────────────────

  it('renderViewport() configura viewport + scissor + scissor test e renderiza', async () => {
    const r = await makeReadyRenderer();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });

    expect(rendererSpies.setViewport).toHaveBeenCalledWith(0, 0, 400, 600);
    expect(rendererSpies.setScissor).toHaveBeenCalledWith(0, 0, 400, 600);
    expect(rendererSpies.setScissorTest).toHaveBeenCalledWith(true);
    expect(rendererSpies.render).toHaveBeenCalledWith(fakeScene, fakeCamera);
  });

  it('renderViewport() desliga scissor test ao final', async () => {
    const r = await makeReadyRenderer();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });

    expect(rendererSpies.setScissorTest.mock.calls).toEqual([[true], [false]]);
  });

  it('renderViewport() NÃO chama clear (split-screen depende disso)', async () => {
    const r = await makeReadyRenderer();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });
    expect(rendererSpies.clear).not.toHaveBeenCalled();
  });

  it('split-screen de 2 viewports: 1× clear + 2× setScissorTest(true) + 2× render', async () => {
    const r = await makeReadyRenderer();
    r.clear();
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });
    r.renderViewport(fakeScene, fakeCamera, { x: 400, y: 0, width: 400, height: 600 });

    expect(rendererSpies.clear).toHaveBeenCalledOnce();
    expect(rendererSpies.render).toHaveBeenCalledTimes(2);
    expect(rendererSpies.setScissorTest.mock.calls).toEqual([
      [true], [false],
      [true], [false],
    ]);
  });

  // ── Tone mapping da UI (regressão de COR no export nativo) ────────────────────
  // A UI de runtime renderiza pela mesma câmera/renderer do jogo (ACESFilmic
  // ligado). `noToneMapping` desliga o ACES só no pass da UI — sem isto a cor de
  // interface (sRGB) saía esfriada/lavada no export. Ver RendererUiBackend.

  it('renderViewport({ noToneMapping }) desliga o tone mapping DURANTE o render e restaura depois', async () => {
    const r = await makeReadyRenderer();
    const inst = lastRendererInstance!;
    inst['toneMapping'] = ACESFilmicToneMapping; // estado do jogo (cena)
    let duringRender: unknown;
    rendererSpies.render.mockImplementationOnce(function (this: Record<string, unknown>) {
      duringRender = this['toneMapping'];
    });
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 }, { noToneMapping: true });
    expect(duringRender).toBe(NoToneMapping); // UI desenhada sem ACES
    expect(inst['toneMapping']).toBe(ACESFilmicToneMapping); // cena não é afetada depois
  });

  it('renderViewport() sem opts NÃO mexe no tone mapping (split-screen 3D mantém o ACES)', async () => {
    const r = await makeReadyRenderer();
    const inst = lastRendererInstance!;
    inst['toneMapping'] = ACESFilmicToneMapping;
    let duringRender: unknown;
    rendererSpies.render.mockImplementationOnce(function (this: Record<string, unknown>) {
      duringRender = this['toneMapping'];
    });
    r.renderViewport(fakeScene, fakeCamera, { x: 0, y: 0, width: 400, height: 600 });
    expect(duringRender).toBe(ACESFilmicToneMapping); // não desligou
    expect(inst['toneMapping']).toBe(ACESFilmicToneMapping);
  });

  // ── resize() ───────────────────────────────────────────────────────────────

  it('resize() atualiza dimensões e setSize (independe do init)', () => {
    const r = makeRenderer();
    rendererSpies.setSize.mockClear();
    r.resize(1024, 768);
    expect(r.width).toBe(1024);
    expect(r.height).toBe(768);
    expect(rendererSpies.setSize).toHaveBeenCalledWith(1024, 768);
  });

  it('resize() IGNORA tamanho 0 (WebGPU recusa texture 0×0) — mantém o último bom', () => {
    const r = makeRenderer(); // 800×600
    rendererSpies.setSize.mockClear();
    r.resize(0, 600);
    r.resize(800, 0);
    r.resize(-10, 100);
    expect(rendererSpies.setSize).not.toHaveBeenCalled();
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
  });

  it('render() é no-op com canvas 0×0 (mesmo após init)', async () => {
    const canvas = {} as HTMLCanvasElement;
    const r = new Renderer({ canvas, width: 0, height: 0 });
    await r.init();
    r.render(fakeScene, fakeCamera);
    r.clear();
    expect(rendererSpies.render).not.toHaveBeenCalled();
    expect(rendererSpies.clear).not.toHaveBeenCalled();
  });

  // ── dispose() ──────────────────────────────────────────────────────────────

  it('dispose() chama dispose do renderer', () => {
    const r = makeRenderer();
    r.dispose();
    expect(rendererSpies.dispose).toHaveBeenCalledOnce();
  });
});
