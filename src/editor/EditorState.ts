/**
 * Estado compartilhado do modo editor — usado pelos sistemas pra saber se devem
 * ceder o controle (input, câmera, física) ao editor. É uma referência mutável
 * (objeto) pra que mudanças em runtime sejam vistas por todos os sistemas que
 * receberam a mesma instância (ex.: passe `pauseWhen: () => editorState.active`).
 */
export interface EditorState {
  active: boolean;
  /**
   * `true` quando a gameplay está **pausada** durante o play (pause Unity-style).
   * Só faz sentido com `active === false` (em play); ao voltar pro editor é zerado.
   */
  paused: boolean;
  /** `true` enquanto o usuário arrasta o gizmo de transformação. */
  gizmoDragging: boolean;
  /**
   * `true` enquanto o usuário **desenha um heightfield** (clica pra adicionar
   * pontos). Os outros sistemas de clique (seleção/gizmo) cedem o clique.
   */
  drawingHeightfield: boolean;
  /**
   * `true` enquanto o usuário **esculpe um terreno** (pincel raise/lower). Os
   * outros sistemas de clique (seleção/gizmo) cedem o clique pro pincel.
   */
  sculptingTerrain: boolean;
  /**
   * **Modo de edição de malha** (blockout/ProBuilder — SPEC-0071). `object` (default)
   * = seleção/gizmo normal de objeto; `vertex`/`edge`/`face` = edição de elementos
   * da malha selecionada (o {@link MeshEditSystem} assume o clique/gizmo e o
   * {@link ObjectEditSystem} cede). Só faz sentido com `active === true`.
   */
  meshEditMode: 'object' | 'vertex' | 'edge' | 'face';
  /**
   * `true` enquanto o usuário **desenha uma caixa no chão** (ProBuilder "New Shape" —
   * arrasta a base no terreno, puxa a altura). Os sistemas de clique (seleção/gizmo/
   * edição de malha) cedem o clique pro {@link ShapeDrawSystem}.
   */
  drawingShape: boolean;
}

export function createEditorState(): EditorState {
  return {
    active: false,
    paused: false,
    gizmoDragging: false,
    drawingHeightfield: false,
    sculptingTerrain: false,
    meshEditMode: 'object',
    drawingShape: false,
  };
}
