/**
 * Tela de loading — cobre a tela enquanto assets/cena carregam.
 * `setProgress` atualiza um rótulo e uma barra (0..1).
 *
 * Duas implementações com a MESMA interface:
 * - {@link createLoadingScreen} — sobre a UI de runtime (ADR-0102): funciona
 *   no Studio, no export PC e no console. **Preferida.**
 * - {@link createDomLoadingScreen} — DOM puro (legado; só browser).
 */
import { UiLabel, UiPanel } from '../ui/runtime/widgets.js';
import type { UiLayer } from '../ui/runtime/UiLayer.js';

export interface LoadingScreen {
  show(): void;
  setProgress(label: string, fraction: number): void;
  hide(): void;
}

export interface LoadingScreenOptions {
  background?: string;
  message?: string;
  /** Cor da barra de progresso. */
  accent?: string;
  parent?: HTMLElement;
}

/**
 * Loading sobre a **UI de runtime** (ADR-0102) — mesma tela nos dois
 * backends (Studio/DOM e host/renderer).
 *
 * @example
 * const loading = createLoadingScreen(game.ui);
 * loading.show();
 * loading.setProgress('Carregando fase…', 0.4);
 * loading.hide();
 */
export function createLoadingScreen(
  ui: UiLayer,
  options: Omit<LoadingScreenOptions, 'parent'> = {},
): LoadingScreen {
  const BAR_WIDTH = 240;
  const background = options.background ?? '#0b0e14';
  const accent = options.accent ?? '#4ec9b0';

  const bg = ui.add(
    new UiPanel({ anchor: 'top-left', width: 16384, height: 16384, background, visible: false }),
  );
  const label = ui.add(
    new UiLabel({
      anchor: 'center',
      y: -16,
      text: options.message ?? 'Carregando...',
      fontSize: 15,
      color: '#ffffff',
      visible: false,
    }),
  );
  const track = ui.add(
    new UiPanel({
      anchor: 'center',
      y: 16,
      width: BAR_WIDTH,
      height: 6,
      background: '#2a3140',
      visible: false,
    }),
  );
  const fill = ui.add(
    new UiPanel({ anchor: 'center', y: 16, width: 1, height: 6, background: accent, visible: false }),
  );

  const setVisible = (visible: boolean): void => {
    bg.set({ visible });
    label.set({ visible });
    track.set({ visible });
    fill.set({ visible });
  };

  return {
    show() {
      setVisible(true);
    },
    setProgress(text, fraction) {
      const clamped = Math.max(0, Math.min(1, fraction));
      const width = Math.max(1, clamped * BAR_WIDTH);
      // fill cresce da ESQUERDA: âncora center + deslocamento de meia folga
      label.set({ text });
      fill.set({ width, x: -(BAR_WIDTH - width) / 2 });
    },
    hide() {
      setVisible(false);
    },
  };
}

/** @deprecated Prefira {@link createLoadingScreen} (funciona no console). */
export function createDomLoadingScreen(options: LoadingScreenOptions = {}): LoadingScreen {
  const background = options.background ?? '#0b0e14';
  const accent = options.accent ?? '#4ec9b0';
  const parent = options.parent ?? document.body;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    `background:${background}`,
    'display:none',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:14px',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'z-index:1000',
    'user-select:none',
  ].join(';');

  const label = document.createElement('div');
  label.style.cssText = 'font-size:15px;opacity:0.9';
  label.textContent = options.message ?? 'Carregando...';

  const barTrack = document.createElement('div');
  barTrack.style.cssText =
    'width:240px;height:6px;border-radius:3px;background:rgba(255,255,255,0.12);overflow:hidden';
  const barFill = document.createElement('div');
  barFill.style.cssText = `height:100%;width:0%;background:${accent};transition:width 120ms ease`;
  barTrack.append(barFill);

  root.append(label, barTrack);
  parent.append(root);

  return {
    show() {
      root.style.display = 'flex';
    },
    setProgress(text, fraction) {
      label.textContent = text;
      const pct = Math.max(0, Math.min(1, fraction)) * 100;
      barFill.style.width = `${pct}%`;
    },
    hide() {
      root.style.display = 'none';
    },
  };
}
