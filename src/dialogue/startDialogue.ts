import { type DialogueGraph } from './DialogueGraph.js';
import { DialogueRunner } from './DialogueRunner.js';
import { createDialogueUI, type DialogueUIOptions } from './DialogueUI.js';
import type { StoryState } from '../narrative/StoryState.js';

/** Handle de um diálogo em andamento, devolvido por {@link startDialogue}. */
export interface DialogueController {
  /** `true` enquanto a conversa está aberta. Use em `system.pauseWhen`. */
  readonly active: boolean;
  /** Encerra e remove a UI imediatamente (ex.: ESC, troca de cena). */
  stop(): void;
}

/** Opções de {@link startDialogue}. */
export interface StartDialogueOptions extends DialogueUIOptions {
  /** Estado de história pra `requires`/`set`. */
  story?: StoryState;
  /** Recebe pistas concedidas (`give`) — ligue ao sistema de investigação do jogo. */
  onClue?: (clueId: string) => void;
  /** Chamado quando a conversa termina (naturalmente ou via `stop`). */
  onEnd?: () => void;
  /**
   * Teclas que avançam linhas simples. Default `['e', 'Enter', ' ']`. Escolhas
   * são por clique (e teclas numéricas `1..9`).
   */
  advanceKeys?: string[];
}

/**
 * Abre um diálogo: conecta {@link DialogueRunner} (lógica) + {@link createDialogueUI}
 * (DOM) + teclado, e devolve um {@link DialogueController} (ADR-0070).
 *
 * O gameplay deve **pausar** enquanto `controller.active` — fie seus sistemas com
 * `pauseWhen: () => controller.active` (ou um flag global). O input de jogo (WASD/
 * mouse-look) deve ignorar enquanto ativo; este helper só captura o teclado da UI.
 *
 * @example
 * const dlg = startDialogue(graph, { story, onClue: (id) => caseState.collectClue(id) });
 * camera.pauseWhen = () => dlg.active;   // ou pause global
 */
export function startDialogue(
  graph: DialogueGraph,
  options: StartDialogueOptions = {},
): DialogueController {
  const advanceKeys = options.advanceKeys ?? ['e', 'Enter', ' '];
  let active = true;

  const runner = new DialogueRunner(graph, {
    story: options.story,
    onClue: options.onClue,
  });

  const finish = (): void => {
    if (!active) return;
    active = false;
    window.removeEventListener('keydown', onKey, true);
    ui.destroy();
    options.onEnd?.();
  };

  const step = (view: { isLine: boolean }): void => {
    ui.render(view as never);
    // Diálogo terminado → view vazia (sem texto e isLine). Fecha.
    if (runner.done) finish();
  };

  const choose = (index: number): void => {
    if (!active) return;
    step(runner.choose(index));
  };
  const advance = (): void => {
    if (!active) return;
    step(runner.advance());
  };

  const ui = createDialogueUI(
    { onChoose: choose, onAdvance: advance },
    { parent: options.parent, accent: options.accent },
  );

  const onKey = (e: KeyboardEvent): void => {
    if (!active) return;
    const view = runner.done ? null : runner.current();
    if (!view) return;
    if (view.isLine && advanceKeys.includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      advance();
      return;
    }
    // Teclas numéricas 1..9 escolhem a N-ésima opção VISÍVEL.
    if (!view.isLine && /^[1-9]$/.test(e.key)) {
      const visible = view.choices[Number(e.key) - 1];
      if (visible) {
        e.preventDefault();
        e.stopPropagation();
        choose(visible.index);
      }
    }
  };
  // Captura (`true`) pra ter prioridade sobre o input de jogo.
  window.addEventListener('keydown', onKey, true);

  // Primeira view (aplica efeitos de entrada do nó start).
  step(runner.start());

  return {
    get active(): boolean {
      return active;
    },
    stop(): void {
      finish();
    },
  };
}
