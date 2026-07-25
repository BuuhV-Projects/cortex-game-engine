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
  /** Remove os elementos da tela (widgets do UiLayer / nó do DOM). */
  destroy(): void;
}

export interface LoadingScreenOptions {
  background?: string;
  message?: string;
  /** Cor da barra de progresso. */
  accent?: string;
  parent?: HTMLElement;
  /**
   * Liga/desliga a tela visível — só afeta {@link runWithLoadingScreen} (default
   * `true`). Passe `false` no **editor** (`{ enabled: !game.editorActive }`): lá o
   * usuário itera direto e **editar um script recarrega a página** (HMR do Vite),
   * então um overlay a cada reload atrapalha e "reinicia a cena" visualmente. Com
   * `false` a `task` roda igual, só **sem a tela** (nem o loop de render) — como o
   * boot fazia antes da tela existir. Em **Play/export** deixe `true` (cobre o
   * carregamento pesado e o frame congelado antes do `game.start()`).
   */
  enabled?: boolean;
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
    destroy() {
      setVisible(false);
      ui.remove(bg);
      ui.remove(label);
      ui.remove(track);
      ui.remove(fill);
    },
  };
}

/**
 * Mostra uma tela de loading e **dirige o loop de render da UI** enquanto
 * `task` roda, escondendo tudo ao terminar. Resolve o caso clássico do menu
 * congelado: entre escolher a fase e o `game.start()` NÃO há loop de render, e
 * o carregamento pesado (GLBs, física, áudio) trava a última imagem. Aqui um
 * `requestAnimationFrame` desenha a UI (fundo + barra) a cada quadro durante o
 * carregamento — funciona no Studio e no export nativo (mesma UiLayer).
 *
 * A tela é **pré-pintada e apresentada (2 quadros) ANTES da task** (SPEC-0154):
 * no host nativo a carga roda numa única virada de JS (fetch síncrono) e o rAF
 * não dispara no meio — o que fica na tela durante a carga é o último frame
 * apresentado antes dela, então ele TEM de ser o loading (e imagem de fundo,
 * se houver, precisa do 2º quadro pra estar aplicada).
 *
 * **`await`e cada `progress(...)`** pra barra avançar por etapa também no
 * export (a promise resolve no rAF seguinte = present do quadro). Ignorar o
 * retorno funciona, mas no host a barra fica no estado da última apresentação.
 *
 * @example
 * const scene = await runWithLoadingScreen(game.ui, async (progress) => {
 *   await progress('Carregando cena…', 0.3);
 *   const s = await buildScene(...);
 *   await progress('Áudio…', 0.8);
 *   await setupAudio(game);
 *   return s;
 * });
 * game.start();
 */
export async function runWithLoadingScreen<T>(
  ui: UiLayer,
  task: (progress: (label: string, fraction: number) => Promise<void>) => Promise<T>,
  options: Omit<LoadingScreenOptions, 'parent'> = {},
): Promise<T> {
  // Desligada (editor): roda a task SEM overlay nem loop de render — igual ao
  // boot pré-tela-de-loading. `progress` vira no-op. Evita o overlay piscar a
  // cada reload de HMR (editar script) durante a edição no Studio.
  if (options.enabled === false) {
    return task(() => Promise.resolve());
  }

  const loading = createLoadingScreen(ui, options);
  loading.show();
  // Barra em 0% ANTES da pré-pintura — sem isto o quadro apresentado mostra os
  // widgets como criados (fill de 1px no centro), não o estado "carga no início".
  loading.setProgress(options.message ?? 'Carregando...', 0);

  // Pré-pintura (SPEC-0154): pinta e APRESENTA a tela antes da task. No host a
  // carga inteira roda numa única virada de JS — nada pinta no meio — então o
  // quadro congelado durante a carga é o último apresentado AQUI. São 2 quadros
  // porque imagem de fundo carrega assíncrono: a pintura 1 dispara o load, só a
  // 2 desenha com ela aplicada.
  const paint = (): void => {
    ui.update(0);
    ui.render();
  };
  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));
  paint();
  await nextFrame();
  paint();
  await nextFrame();

  // Renderiza SÓ quando o progresso muda (a tela é estática entre etapas). No
  // host nativo o loop principal só bloqueia no vsync (present) QUANDO algo
  // desenha — renderizar todo quadro (60 fps) serializaria o carregamento
  // (buildScene avança por quadro) e triplicaria o tempo. Desenhando só nas
  // trocas de etapa, o host gira livre e o carregamento roda na velocidade
  // máxima; o último quadro apresentado (a barra) fica na tela no intervalo.
  let active = true;
  let dirty = false; // a pré-pintura acima já desenhou a abertura
  const frame = (): void => {
    if (!active) return;
    if (dirty) {
      ui.update(0);
      ui.render();
      dirty = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  try {
    // `progress` pinta NA HORA e devolve a promise do próximo rAF (= present do
    // quadro no host). Task que `await`a cada progress faz a barra andar POR
    // ETAPA também no export (SPEC-0154); quem ignora o retorno fica com o
    // comportamento antigo (dirty → o loop acima pinta; no host, estática).
    return await task((label, fraction) => {
      loading.setProgress(label, fraction);
      paint();
      dirty = false; // já pintado — o loop não precisa repetir este quadro
      return nextFrame();
    });
  } finally {
    active = false;
    loading.destroy();
    ui.render(); // desenha um quadro sem os widgets do loading
  }
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
    destroy() {
      root.remove();
    },
  };
}
