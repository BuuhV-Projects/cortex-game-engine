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
  /**
   * Sincroniza visuais com a lista de widgets (cria/atualiza/remove). O
   * `viewport` é o de DESIGN (espaço lógico do layout, ver `layout.ts`); o
   * backend PRESENTA esse espaço esticado pra tela real pelo `scale` (DOM: uma
   * `transform: scale` na raiz; renderer: câmera no espaço de design + região de
   * render no viewport real). `scale` default 1 = sem escala (ADR-0129).
   */
  sync(widgets: ReadonlyArray<UiWidget>, viewport: UiViewport, scale?: number): void;
  /** Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho). */
  render(): void;
  /** Remove tudo (troca de cena/shutdown). */
  dispose(): void;
}
