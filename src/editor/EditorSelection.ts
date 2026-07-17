import type { Object3D } from 'three';

/**
 * Ponte de seleção observável do modo editor — desacopla quem **pede** seleção
 * (painéis de UI, ex.: a hierarquia) de quem é **dono** dela (o
 * {@link ObjectEditSystem}, que ataca o gizmo). É um objeto compartilhado, no
 * mesmo espírito do {@link EditorState}: todos recebem a mesma instância.
 *
 * Suporta **multi-seleção** (Ctrl+click): o conjunto vive em `items` (ordem de
 * seleção) e `current` é o **primário** (último selecionado — quem recebe o
 * gizmo). Com um só objeto selecionado, `items = [current]` — os consumidores
 * antigos que só leem `current` continuam corretos.
 *
 * Fluxo (sem loop de eventos):
 * - Painel → sistema: `requestSelect(obj, { additive })` (o sistema escuta via
 *   `onSelectRequest`). `additive: true` = Ctrl+click (alterna o objeto no conjunto).
 * - Sistema → painéis: `setCurrent(obj, items)` atualiza `current`/`items` e
 *   dispara `onChange`.
 * - Sistema → inspector: `emitTransform()` quando o gizmo move o selecionado.
 *
 * Só o {@link ObjectEditSystem} deve chamar `setCurrent`/`emitTransform`; os
 * painéis usam `requestSelect` e assinam `onChange`/`onTransform`.
 */
export interface SelectRequestOptions {
  /** `true` = seleção aditiva (Ctrl+click): alterna o objeto no conjunto. */
  additive?: boolean;
}

export interface EditorSelection {
  /** Objeto primário selecionado (ou `null`). Escrito pelo ObjectEditSystem. */
  current: Object3D | null;
  /**
   * Conjunto selecionado, em ordem de seleção (o último é o primário). Vazio
   * quando nada selecionado; com seleção simples, `[current]`.
   */
  items: readonly Object3D[];
  /** `true` se o objeto está no conjunto selecionado. */
  isSelected(obj: Object3D): boolean;

  /**
   * Pede a seleção de um objeto (ou desseleção com `null`). Painel → sistema.
   * `opts.additive` alterna o objeto no conjunto (Ctrl+click) em vez de trocar.
   */
  requestSelect(obj: Object3D | null, opts?: SelectRequestOptions): void;
  /** Assina pedidos de seleção (o ObjectEditSystem usa). Retorna unsubscribe. */
  onSelectRequest(cb: (obj: Object3D | null, opts?: SelectRequestOptions) => void): () => void;

  /**
   * Define a seleção efetiva e notifica `onChange`. Sistema → painéis.
   * `items` é o conjunto completo (default: `[obj]`, ou `[]` com `null`).
   */
  setCurrent(obj: Object3D | null, items?: readonly Object3D[]): void;
  /** Assina mudanças de seleção (recebe o primário; leia `items` pro conjunto). */
  onChange(cb: (obj: Object3D | null) => void): () => void;

  /** Notifica que a transform do selecionado mudou (ex.: drag do gizmo). */
  emitTransform(): void;
  /** Assina mudanças de transform do selecionado. Retorna unsubscribe. */
  onTransform(cb: (obj: Object3D) => void): () => void;
}

function emitter<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>();
  return {
    add(cb: (...args: T) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    fire(...args: T): void {
      for (const cb of listeners) cb(...args);
    },
  };
}

function sameItems(a: readonly Object3D[], b: readonly Object3D[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Cria uma {@link EditorSelection} vazia. */
export function createEditorSelection(): EditorSelection {
  const requests = emitter<[Object3D | null, SelectRequestOptions | undefined]>();
  const changes = emitter<[Object3D | null]>();
  const transforms = emitter<[Object3D]>();

  const selection: EditorSelection = {
    current: null,
    items: [],
    isSelected: (obj) => selection.items.includes(obj),
    requestSelect: (obj, opts) => requests.fire(obj, opts),
    onSelectRequest: (cb) => requests.add(cb),
    setCurrent(obj, items) {
      const next: readonly Object3D[] = items ?? (obj ? [obj] : []);
      if (selection.current === obj && sameItems(selection.items, next)) return;
      selection.current = obj;
      selection.items = [...next];
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
