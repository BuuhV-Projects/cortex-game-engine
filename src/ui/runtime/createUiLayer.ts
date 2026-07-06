/**
 * Fábrica do {@link UiLayer} com seleção AUTOMÁTICA de backend (ADR-0102):
 * - host CortexNative (expõe `__cortexRasterText`) → {@link RendererUiBackend}
 * - browser/Studio → {@link DomUiBackend}
 * O jogo não escolhe backend — só usa `game.ui`.
 */
import { DomUiBackend } from './DomUiBackend.js';
import { RendererUiBackend, hasNativeTextRaster, type UiRenderTarget } from './RendererUiBackend.js';
import { UiLayer } from './UiLayer.js';
import type { UiViewport } from './layout.js';

export function createUiLayer(target: UiRenderTarget, viewportOf: () => UiViewport): UiLayer {
  const backend = hasNativeTextRaster()
    ? new RendererUiBackend(target)
    : new DomUiBackend();
  return new UiLayer(backend, viewportOf);
}
