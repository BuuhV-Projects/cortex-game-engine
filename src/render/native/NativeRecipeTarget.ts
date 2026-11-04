/**
 * O alvo de desenho da lista corrente (SPEC-0685): formatos de cor/profundidade/amostras do
 * `renderContext`, a chave das receitas e um id inteiro dela. É o mesmo para todas as entradas de
 * uma lista, então é lido uma vez por lista (`use`) e não por entrada e passe.
 */
import type { NativeRendererHost } from './nativeRendererShared.js';

/** `Inst.passTarget` sem receita devolvida ainda. */
export const NO_TARGET = -1;

type TargetUtils = NativeRendererHost['backend']['utils'];

/** `context` ainda não lido (nem `null` nem `undefined` servem: são contextos possíveis). */
const UNREAD: unknown = Object.freeze({});

export class RecipeTarget {
  /** O `renderContext` lido por último; `UNREAD` = ler de novo na próxima chamada. */
  context: unknown = UNREAD;
  color = '';
  depth = '';
  samples = 0;
  /** Id da chave base `color|depth|samples`: o mesmo para a mesma chave durante a vida do renderer. */
  id = NO_TARGET;
  private _base = '';
  private readonly _keys: string[] = [];
  private readonly _ids = new Map<string, number>();

  /** Relê os formatos do `renderContext` e recalcula id e chaves por passe. */
  use(utils: TargetUtils, renderContext: unknown): void {
    this.context = renderContext;
    this.color = utils.getCurrentColorFormat(renderContext);
    this.depth = utils.getCurrentDepthStencilFormat(renderContext);
    this.samples = utils.getSampleCountRenderContext(renderContext);
    const base = `${this.color}|${this.depth}|${this.samples}`;
    if (base === this._base) return;
    this._base = base;
    this._keys.length = 0;
    let id = this._ids.get(base);
    if (id === undefined) this._ids.set(base, (id = this._ids.size));
    this.id = id;
  }

  /** Chave de `inst.recipes` do passe (`color|depth|samples|pass`, como antes da SPEC-0685). */
  key(pass: number): string {
    return (this._keys[pass] ??= `${this._base}|${pass}`);
  }

  /** Esquece o contexto: a próxima chamada relê o alvo (uma vez por quadro, no `beginFrame`). */
  reset(): void {
    this.context = UNREAD;
  }
}
