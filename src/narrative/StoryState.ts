/**
 * StoryState — store de **flags de história** (ADR-0070).
 *
 * É a memória narrativa do jogo: o que o jogador já fez/descobriu/escolheu.
 * Lógica pura e **serializável** — base do save narrativo (o jogo pode combiná-la
 * com seu próprio estado de investigação). Sem DOM, sem Three, sem ECS → testável.
 *
 * Uma flag "ligada" é qualquer valor **truthy** (`true`, número ≠ 0, string não
 * vazia). `has(key)` reflete isso; `requires` de diálogo usa `has`.
 *
 * @example
 * const story = new StoryState();
 * story.set('falou_com_marlene', true);
 * story.has('falou_com_marlene'); // true
 */
export type FlagValue = boolean | number | string;

export class StoryState {
  private readonly _flags = new Map<string, FlagValue>();

  /** Lê o valor cru de uma flag (ou `undefined` se nunca setada). */
  get(key: string): FlagValue | undefined {
    return this._flags.get(key);
  }

  /** Define uma flag. */
  set(key: string, value: FlagValue): void {
    this._flags.set(key, value);
  }

  /** `true` se a flag existe e é **truthy** (ligada). */
  has(key: string): boolean {
    const v = this._flags.get(key);
    return v !== undefined && v !== false && v !== 0 && v !== '';
  }

  /** `true` se **todas** as flags estão ligadas (`has`). `[]` → `true`. */
  hasAll(keys: readonly string[]): boolean {
    return keys.every((k) => this.has(k));
  }

  /** Aplica um lote de flags (ex.: o `set` de um nó/escolha de diálogo). */
  apply(patch: Readonly<Record<string, FlagValue>> | undefined): void {
    if (!patch) return;
    for (const [k, v] of Object.entries(patch)) this._flags.set(k, v);
  }

  /** Serializa pra um objeto simples (save). */
  toJSON(): Record<string, FlagValue> {
    return Object.fromEntries(this._flags);
  }

  /** Reconstrói a partir de um objeto serializado. */
  static fromJSON(obj: Readonly<Record<string, FlagValue>> | null | undefined): StoryState {
    const s = new StoryState();
    if (obj) s.apply(obj);
    return s;
  }
}
