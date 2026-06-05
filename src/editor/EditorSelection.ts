import type { Object3D } from 'three';

/**
 * Ponte de seleção observável do modo editor — desacopla quem **pede** seleção
 * (painéis de UI, ex.: a hierarquia) de quem é **dono** dela (o
 * {@link ObjectEditSystem}, que ataca o gizmo). É um objeto compartilhado, no
 * mesmo espírito do {@link EditorState}: todos recebem a mesma instância.
 *
 * Fluxo (sem loop de eventos):
 * - Painel → sistema: `requestSelect(obj)` (o sistema escuta via `onSelectRequest`).
 * - Sistema → painéis: `setCurrent(obj)` atualiza `current` e dispara `onChange`.
 * - Sistema → inspector: `emitTransform()` quando o gizmo move o selecionado.
 *
 * Só o {@link ObjectEditSystem} deve chamar `setCurrent`/`emitTransform`; os
 * painéis usam `requestSelect` e assinam `onChange`/`onTransform`.
 */
export interface EditorSelection {
  /** Objeto atualmente selecionado (ou `null`). Escrito pelo ObjectEditSystem. */
  current: Object3D | null;

  /** Pede a seleção de um objeto (ou desseleção com `null`). Painel → sistema. */
  requestSelect(obj: Object3D | null): void;
  /** Assina pedidos de seleção (o ObjectEditSystem usa). Retorna unsubscribe. */
  onSelectRequest(cb: (obj: Object3D | null) => void): () => void;

  /** Define a seleção efetiva e notifica `onChange`. Sistema → painéis. */
  setCurrent(obj: Object3D | null): void;
  /** Assina mudanças de seleção. Retorna unsubscribe. */
  onChange(cb: (obj: Object3D | null) => void): () => void;

  /** Notifica que a transform do selecionado mudou (ex.: drag do gizmo). */
  emitTransform(): void;
  /** Assina mudanças de transform do selecionado. Retorna unsubscribe. */
  onTransform(cb: (obj: Object3D) => void): () => void;
}

function emitter<T>() {
  const listeners = new Set<(arg: T) => void>();
  return {
    add(cb: (arg: T) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    fire(arg: T): void {
      for (const cb of listeners) cb(arg);
    },
  };
}

/** Cria uma {@link EditorSelection} vazia. */
export function createEditorSelection(): EditorSelection {
  const requests = emitter<Object3D | null>();
  const changes = emitter<Object3D | null>();
  const transforms = emitter<Object3D>();

  const selection: EditorSelection = {
    current: null,
    requestSelect: (obj) => requests.fire(obj),
    onSelectRequest: (cb) => requests.add(cb),
    setCurrent(obj) {
      if (selection.current === obj) return;
      selection.current = obj;
      changes.fire(obj);
    },
    onChange: (cb) => changes.add(cb),
    emitTransform() {
      if (selection.current) transforms.fire(selection.current);
    },
    onTransform: (cb) => transforms.add(cb),
  };
  return selection;
}
