/**
 * Contrato dos backends da UI de runtime (ADR-0102). O {@link UiLayer} é o
 * dono dos widgets e da navegação; o backend só DESENHA:
 * - `DomUiBackend` (Studio/browser): divs absolutas.
 * - `RendererUiBackend` (CortexNative/console): cena ortográfica por cima do
 *   jogo, texto rasterizado nativo.
 */
import type { UiViewport } from './layout.js';
import type { UiWidget } from './widgets.js';

export interface UiBackend {
  /** Sincroniza visuais com a lista de widgets (cria/atualiza/remove). */
  sync(widgets: ReadonlyArray<UiWidget>, viewport: UiViewport): void;
  /** Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho). */
  render(): void;
  /** Remove tudo (troca de cena/shutdown). */
  dispose(): void;
}
