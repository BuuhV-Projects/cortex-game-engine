/**
 * Estado compartilhado do modo editor — usado pelos sistemas pra saber se devem
 * ceder o controle (input, câmera, física) ao editor. É uma referência mutável
 * (objeto) pra que mudanças em runtime sejam vistas por todos os sistemas que
 * receberam a mesma instância (ex.: passe `pauseWhen: () => editorState.active`).
 */
export interface EditorState {
  active: boolean;
  /** `true` enquanto o usuário arrasta o gizmo de transformação. */
  gizmoDragging: boolean;
}

export function createEditorState(): EditorState {
  return { active: false, gizmoDragging: false };
}
