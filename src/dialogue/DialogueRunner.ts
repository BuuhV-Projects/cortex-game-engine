import {
  type DialogueGraph,
  type DialogueNode,
  indexDialogueNodes,
} from './DialogueGraph.js';
import { StoryState } from '../narrative/StoryState.js';

/**
 * O que a UI precisa pra desenhar o estado atual da conversa. Imutável: cada
 * transição produz um novo {@link DialogueView}.
 */
export interface DialogueView {
  /** Nó atual (id). */
  nodeId: string;
  /** Quem fala (se houver). */
  speaker?: string;
  /** Texto da fala. */
  text: string;
  /**
   * Escolhas **visíveis** (já filtradas por `requires`), com o índice **original**
   * na lista do nó — passe esse índice de volta pra {@link DialogueRunner.choose}.
   */
  choices: { text: string; index: number }[];
  /** `true` quando é uma **linha simples** (sem escolhas) — avança com `advance()`. */
  isLine: boolean;
}

/** Opções do {@link DialogueRunner}. */
export interface DialogueRunnerOptions {
  /** Estado de história pra `requires`/`set` (criado vazio se omitido). */
  story?: StoryState;
  /** Chamado quando um nó/escolha concede uma pista (`give`). O jogo decide o efeito. */
  onClue?: (clueId: string) => void;
}

/**
 * **Percorre um grafo de diálogo** (ADR-0070). Lógica **pura** — sem DOM, sem
 * Three, sem ECS → testável isoladamente (Vitest). A UI (DOM) assina as views; o
 * runner não conhece a UI.
 *
 * Efeitos colaterais são determinísticos e aplicados **uma vez** por transição:
 * ao **entrar** num nó aplica `node.set`/`node.give`; ao **escolher** aplica o
 * `set`/`give` da escolha **antes** de transicionar.
 *
 * @example
 * const runner = new DialogueRunner(graph, { story, onClue: (id) => caseState.collectClue(id) });
 * let view = runner.start();
 * // ...mostra view; quando o jogador clica a escolha de índice i:
 * view = runner.choose(i);
 * if (runner.done) closeUi();
 */
export class DialogueRunner {
  private readonly _nodes: Map<string, DialogueNode>;
  private readonly _story: StoryState;
  private readonly _onClue?: (clueId: string) => void;
  private _currentId: string | null = null;
  private _done = false;

  constructor(
    private readonly graph: DialogueGraph,
    options: DialogueRunnerOptions = {},
  ) {
    this._nodes = indexDialogueNodes(graph);
    this._story = options.story ?? new StoryState();
    this._onClue = options.onClue;
  }

  /** O `StoryState` em uso (próprio ou o injetado). */
  get story(): StoryState {
    return this._story;
  }

  /** `true` quando o diálogo terminou (não há mais nó atual). */
  get done(): boolean {
    return this._done;
  }

  /** Inicia no nó `start`, aplica seus efeitos de entrada e devolve a view. */
  start(): DialogueView {
    return this._enter(this.graph.start);
  }

  /** A view do estado atual. Lança se chamado antes de `start()` ou após `done`. */
  current(): DialogueView {
    const node = this._requireCurrent();
    return this._viewOf(node);
  }

  /**
   * Escolhe a opção de índice **original** `index` no nó atual. Aplica
   * `set`/`give` da escolha e transiciona pro `next` (ou encerra se `next` nulo).
   */
  choose(index: number): DialogueView {
    const node = this._requireCurrent();
    const choice = node.choices?.[index];
    if (!choice) {
      throw new Error(`DialogueRunner: escolha ${index} inválida no nó "${node.id}".`);
    }
    if (choice.requires && !this._story.hasAll(choice.requires)) {
      throw new Error(`DialogueRunner: escolha ${index} indisponível (requires) no nó "${node.id}".`);
    }
    this._story.apply(choice.set);
    if (choice.give) this._onClue?.(choice.give);
    return this._goto(choice.next);
  }

  /**
   * Avança uma **linha simples** (nó sem escolhas) pro `next`. Lança se o nó atual
   * tiver escolhas (use `choose`) ou se já terminou.
   */
  advance(): DialogueView {
    const node = this._requireCurrent();
    if (node.choices && node.choices.length > 0) {
      throw new Error(`DialogueRunner: nó "${node.id}" tem escolhas; use choose().`);
    }
    return this._goto(node.next);
  }

  // ─── interno ──────────────────────────────────────────────────────────────

  private _goto(next: string | null | undefined): DialogueView {
    if (next == null) {
      this._currentId = null;
      this._done = true;
      return this._endView();
    }
    return this._enter(next);
  }

  private _enter(id: string): DialogueView {
    const node = this._nodes.get(id);
    if (!node) throw new Error(`DialogueRunner: nó "${id}" não existe.`);
    this._currentId = id;
    this._done = false;
    // Efeitos de entrada (uma vez, ao entrar no nó).
    this._story.apply(node.set);
    if (node.give) this._onClue?.(node.give);
    return this._viewOf(node);
  }

  private _viewOf(node: DialogueNode): DialogueView {
    const choices = (node.choices ?? [])
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => !c.requires || this._story.hasAll(c.requires))
      .map(({ c, index }) => ({ text: c.text, index }));
    return {
      nodeId: node.id,
      speaker: node.speaker,
      text: node.text,
      choices,
      isLine: choices.length === 0,
    };
  }

  private _requireCurrent(): DialogueNode {
    if (this._currentId == null) {
      throw new Error('DialogueRunner: diálogo não iniciado ou já terminado (chame start()).');
    }
    return this._nodes.get(this._currentId)!;
  }

  private _endView(): DialogueView {
    return { nodeId: '', text: '', choices: [], isLine: true };
  }
}
