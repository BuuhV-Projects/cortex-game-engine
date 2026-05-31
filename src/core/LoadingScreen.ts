/**
 * Tela de loading DOM simples — cobre a tela enquanto assets/cena carregam.
 * `setProgress` atualiza um rótulo e uma barra (0..1).
 */
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
