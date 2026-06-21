import type { DialogueView } from './DialogueRunner.js';

/**
 * UI de diálogo em **DOM overlay** (ADR-0070) — primeira UI de runtime do engine,
 * no mesmo padrão de `createDomLoadingScreen` (DOM sobre o canvas, não quads no
 * Three). Production-safe (vai pro bundle de runtime). É **fina e burra**: só
 * desenha a {@link DialogueView} e avisa quando o jogador escolhe/avança — toda a
 * lógica está no {@link DialogueRunner}.
 */
export interface DialogueUI {
  /** Desenha a view (fala + escolhas) e mostra a caixa. */
  render(view: DialogueView): void;
  /** Esconde a caixa. */
  hide(): void;
  /** Remove a UI do DOM. */
  destroy(): void;
  /** Avança a linha simples atual via teclado (chamado pelo glue). */
  advanceLine(): void;
}

/** Callbacks da UI. */
export interface DialogueUIHandlers {
  /** Jogador escolheu a opção de índice `index` (índice original do nó). */
  onChoose(index: number): void;
  /** Jogador avançou uma linha simples (clique/tecla). */
  onAdvance(): void;
}

export interface DialogueUIOptions {
  parent?: HTMLElement;
  accent?: string;
}

export function createDialogueUI(
  handlers: DialogueUIHandlers,
  options: DialogueUIOptions = {},
): DialogueUI {
  const parent = options.parent ?? document.body;
  const accent = options.accent ?? '#e0c068';

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:6%',
    'transform:translateX(-50%)',
    'width:min(760px,92vw)',
    'display:none',
    'flex-direction:column',
    'gap:10px',
    'padding:18px 20px',
    'background:rgba(12,14,20,0.92)',
    'border:1px solid rgba(255,255,255,0.10)',
    'border-radius:10px',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'z-index:1100',
    'user-select:none',
    'box-shadow:0 8px 30px rgba(0,0,0,0.45)',
  ].join(';');

  const speakerEl = document.createElement('div');
  speakerEl.style.cssText = `font-size:13px;font-weight:600;letter-spacing:0.02em;color:${accent}`;

  const textEl = document.createElement('div');
  textEl.style.cssText = 'font-size:16px;line-height:1.45';

  const choicesEl = document.createElement('div');
  choicesEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px';

  const hintEl = document.createElement('div');
  hintEl.style.cssText = 'font-size:12px;opacity:0.55;align-self:flex-end';
  hintEl.textContent = '[E] continuar';

  root.append(speakerEl, textEl, choicesEl, hintEl);
  parent.append(root);

  const makeChoiceButton = (text: string, index: number): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
      'text-align:left',
      'padding:9px 12px',
      'background:rgba(255,255,255,0.06)',
      'border:1px solid rgba(255,255,255,0.10)',
      'border-radius:7px',
      'color:#fff',
      'font:inherit',
      'font-size:15px',
      'cursor:pointer',
    ].join(';');
    btn.onmouseenter = (): void => {
      btn.style.background = 'rgba(255,255,255,0.13)';
    };
    btn.onmouseleave = (): void => {
      btn.style.background = 'rgba(255,255,255,0.06)';
    };
    btn.onclick = (): void => handlers.onChoose(index);
    return btn;
  };

  let currentIsLine = false;

  return {
    render(view: DialogueView): void {
      speakerEl.textContent = view.speaker ?? '';
      speakerEl.style.display = view.speaker ? 'block' : 'none';
      textEl.textContent = view.text;
      choicesEl.replaceChildren();
      currentIsLine = view.isLine;
      if (view.isLine) {
        hintEl.style.display = 'block';
      } else {
        hintEl.style.display = 'none';
        for (const c of view.choices) choicesEl.append(makeChoiceButton(c.text, c.index));
      }
      root.style.display = 'flex';
    },
    advanceLine(): void {
      if (currentIsLine) handlers.onAdvance();
    },
    hide(): void {
      root.style.display = 'none';
    },
    destroy(): void {
      root.remove();
    },
  };
}
