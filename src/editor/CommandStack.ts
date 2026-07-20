/**
 * Pilha de comandos (undo/redo) do editor. Cada {@link EditorCommand} sabe se desfazer
 * (`undo`) e refazer (`redo`). Ações já EXECUTADAS são empilhadas via {@link CommandStack.push};
 * `undo()` reverte a última, `redo()` refaz. Registrar uma nova ação limpa o redo (estilo
 * editor padrão). Base do CTRL+Z abrangente (SPEC-0084) — começa por transform/add/delete.
 */
export interface EditorCommand {
  /** Rótulo curto (debug/telemetria). */
  label: string;
  /** Reverte a ação (volta ao estado anterior). */
  undo(): void;
  /** Refaz a ação (reaplica). */
  redo(): void;
}

export class CommandStack {
  private readonly undoStack: EditorCommand[] = [];
  private readonly redoStack: EditorCommand[] = [];

  constructor(private readonly max = 200) {}

  /** Registra uma ação JÁ executada (não chama `redo` — só guarda pra desfazer/refazer). */
  push(cmd: EditorCommand): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack.length = 0; // nova ação invalida o redo
  }

  /** Desfaz a última ação. Retorna `false` se não há nada. */
  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  /** Refaz a última ação desfeita. Retorna `false` se não há nada. */
  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo();
    this.undoStack.push(cmd);
    return true;
  }

  /** Limpa o histórico (ex.: ao trocar de cena). */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
