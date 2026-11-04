/**
 * Reenvios da UI à GPU por widget no perf-trace (SPEC-0688): texto que muda conta, texto parado não; canvas conta
 * quando nasce e quando o host diz que o bitmap mudou.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installDomLite } from '../../native/js/src/shims/dom-lite.js';
import { installCanvas2d } from '../../native/js/src/shims/canvas2d/index.js';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import { UiCanvas, UiLabel } from '../../src/ui/runtime/widgets.js';
import { drainTraceCounters, resetTraceCounters, setTraceCountersActive } from '../../src/core/perfTrace/traceCounters.js';

const VIEWPORT = { width: 800, height: 600 };
const mockTarget = (): UiRenderTarget => ({ renderViewport: () => {} });
const BITMAP_W = 8;
const BITMAP_H = 4;

beforeAll(() => {
  installDomLite();
  installCanvas2d();
});

beforeEach(() => {
  resetTraceCounters();
  setTraceCountersActive(true);
  (globalThis as Record<string, unknown>)['__cortexRasterText'] = () => ({
    width: BITMAP_W,
    height: BITMAP_H,
    rgba: new ArrayBuffer(BITMAP_W * BITMAP_H * 4),
  });
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__cortexRasterText'];
  resetTraceCounters();
});

describe('RendererUiBackend — uiUploads (SPEC-0688)', () => {
  it('conta cada reenvio de texto pelo id do label, com o texto como pista', () => {
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '0:01', fontSize: 18 });
    backend.sync([label], VIEWPORT); // textura nova
    label.set({ text: '0:02' });
    backend.sync([label], VIEWPORT); // reescrita no lugar
    backend.sync([label], VIEWPORT); // parado: nada sobe
    expect(drainTraceCounters().uiUploads).toEqual({
      total: 2,
      top: [{ widget: `label#${label.id}`, count: 2, hint: '0:02' }],
    });
  });

  it('canvas: conta ao nascer e quando o bitmap muda, não quando está parado', () => {
    const backend = new RendererUiBackend(mockTarget());
    const c = new UiCanvas();
    c.canvas.width = 16;
    c.canvas.height = 16;
    backend.sync([c], VIEWPORT);
    backend.sync([c], VIEWPORT);
    c.canvas.getContext('2d')!.fillRect(0, 0, 4, 4);
    backend.sync([c], VIEWPORT);
    expect(drainTraceCounters().uiUploads).toEqual({ total: 2, top: [{ widget: `canvas#${c.id}`, count: 2 }] });
  });

  it('sem o trace ativo, nada é contado', () => {
    setTraceCountersActive(false);
    const backend = new RendererUiBackend(mockTarget());
    backend.sync([new UiLabel({ text: 'oi', fontSize: 18 })], VIEWPORT);
    expect(drainTraceCounters().uiUploads).toBeUndefined();
  });
});
