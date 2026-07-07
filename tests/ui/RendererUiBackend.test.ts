/**
 * Testes do backend RENDERER da UI (export nativo CortexNative) focados em
 * REGRESSÃO DE COR: a UI de runtime renderiza pela mesma câmera/renderer do
 * jogo (ACESFilmic ligado). Sem cuidado, a cor de interface (sRGB autorada)
 * sai esfriada/lavada no export — foi o bug reportado. Estes testes travam os
 * dois pontos do fix:
 *   1. `render()` pede `noToneMapping` (UI fora do ACES do jogo).
 *   2. Botão renderiza OPACO (fillOpacity = opacity do widget, sem o antigo
 *      `*0.96` que deixava o fundo claro vazar e LAVAVA a cor).
 *
 * Usa widgets SEM texto (o raster nativo `__cortexRasterText` só é chamado com
 * texto) e um alvo de render mockado — sem GPU.
 */
import { describe, it, expect } from 'vitest';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import { UiPanel, UiButton } from '../../src/ui/runtime/widgets.js';

type RenderOpts = { noToneMapping?: boolean } | undefined;

function mockTarget(): { target: UiRenderTarget; opts: RenderOpts[] } {
  const opts: RenderOpts[] = [];
  const target: UiRenderTarget = {
    renderViewport: (_scene, _camera, _viewport, o) => {
      opts.push(o);
    },
  };
  return { target, opts };
}

/** Acessa os visuais internos (Map por id) pra inspecionar o uniform do painel. */
function fillOpacityOf(backend: RendererUiBackend, id: number): number | undefined {
  const visuals = (backend as unknown as {
    _visuals: Map<number, { panelUniforms?: { fillOpacity: { value: number } } }>;
  })._visuals;
  return visuals.get(id)?.panelUniforms?.fillOpacity.value;
}

describe('RendererUiBackend — regressão de cor (export nativo)', () => {
  it('render() pede noToneMapping (UI não passa pelo ACES do jogo)', () => {
    const { target, opts } = mockTarget();
    const backend = new RendererUiBackend(target);
    backend.sync([new UiPanel({ background: '#ffb03a', width: 100, height: 40 })], { width: 800, height: 600 });
    backend.render();
    expect(opts).toHaveLength(1);
    expect(opts[0]).toEqual({ noToneMapping: true });
  });

  it('botão renderiza OPACO — fillOpacity = opacity do widget (sem o *0.96 que lavava a cor)', () => {
    const { target } = mockTarget();
    const backend = new RendererUiBackend(target);
    const button = new UiButton({ background: '#5aa0c0', width: 120, height: 48, opacity: 1 });
    backend.sync([button], { width: 800, height: 600 });
    expect(fillOpacityOf(backend, button.id)).toBe(1);
  });

  it('painel respeita a opacity do widget (translúcido continua translúcido)', () => {
    const { target } = mockTarget();
    const backend = new RendererUiBackend(target);
    const scrim = new UiPanel({ background: '#000000', width: 100, height: 100, opacity: 0.6 });
    backend.sync([scrim], { width: 800, height: 600 });
    expect(fillOpacityOf(backend, scrim.id)).toBeCloseTo(0.6);
  });
});
