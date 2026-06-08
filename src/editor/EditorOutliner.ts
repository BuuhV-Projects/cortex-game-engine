import type { Object3D } from 'three';
import type { EditorSelection } from './EditorSelection.js';
import { describeOutliner, createObjectRegistry, type ObjectRegistry } from './EditorModel.js';
import { createOutlinerView } from './EditorModelDom.js';

/** Painel de hierarquia do editor (lista os objetos da cena). */
export interface EditorOutliner {
  /** Elemento raiz (já anexado ao parent). */
  root: HTMLDivElement;
  /** Mostra/esconde o painel (tipicamente atrelado ao editor ON/OFF). */
  setVisible(v: boolean): void;
  /** Reconstrói a lista a partir dos `editRoots` (chame ao abrir o editor / quando a cena mudar). */
  refresh(): void;
}

export interface EditorOutlinerOptions {
  /** Raízes cujos filhos diretos (nomeados) são listados. Ex.: `[scene.getThreeScene()]`. */
  editRoots: Object3D[];
  /** Ponte de seleção compartilhada (mesma instância passada ao ObjectEditSystem). */
  selection: EditorSelection;
  /** Chamado ao clicar num item — ligue ao `EditorCameraSystem.focusOn` pra enquadrar. */
  onFocus?: (obj: Object3D) => void;
  /** Onde anexar o painel. Default `document.body`. */
  parent?: HTMLElement;
  /**
   * Opcional: registro de ids de objeto compartilhado (ADR-0056). Passe a mesma
   * instância usada pela ponte/inspector pra os ids baterem entre renderizadores.
   * Default: um registro novo (suficiente pro caso standalone).
   */
  registry?: ObjectRegistry;
}

/**
 * Cria o painel de **hierarquia** do modo editor: lista os objetos da cena
 * (filhos diretos dos `editRoots`, exceto internos do editor) a partir do
 * {@link describeOutliner | modelo declarativo} (ADR-0056). Clicar num item o
 * **seleciona** (via `selection.requestSelect`) e o **enquadra** (via `onFocus`).
 * O item selecionado fica destacado, reagindo a `selection.onChange`.
 *
 * É opcional/conveniência (acopla ao DOM) — comece escondido e use `setVisible`.
 *
 * @example
 * const outliner = createEditorOutliner({
 *   editRoots: [scene.getThreeScene()],
 *   selection,
 *   onFocus: (obj) => editorCameraSystem.focusOn(obj),
 * })
 * // ao ativar o editor: outliner.setVisible(true); outliner.refresh()
 */
export function createEditorOutliner(options: EditorOutlinerOptions): EditorOutliner {
  const { editRoots, selection, onFocus, parent = document.body, registry = createObjectRegistry() } = options;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:56px',
    'left:0',
    'width:220px',
    'max-height:60vh',
    'overflow-y:auto',
    'padding:8px',
    'background:#15161c',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:12px',
    'display:none',
    'z-index:2147483000',
    'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
    'box-sizing:border-box',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px';
  const title = document.createElement('b');
  title.textContent = 'Hierarquia';
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '⟳';
  refreshBtn.title = 'Atualizar lista';
  refreshBtn.style.cssText =
    'cursor:pointer;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:3px;padding:1px 7px;font-size:12px';
  header.append(title, refreshBtn);

  const view = createOutlinerView({
    onSelect: (id) => {
      const obj = registry.get(id);
      if (obj) selection.requestSelect(obj);
    },
    onFocus: (id) => {
      const obj = registry.get(id);
      if (obj) onFocus?.(obj);
    },
  });

  root.append(header, view.root);
  parent.appendChild(root);

  function refresh(): void {
    view.render(describeOutliner(editRoots, registry, selection.current));
  }

  refreshBtn.addEventListener('click', refresh);
  // Re-renderiza ao mudar a seleção (atualiza o destaque).
  selection.onChange(() => refresh());

  return {
    root,
    setVisible(v: boolean): void {
      root.style.display = v ? 'block' : 'none';
    },
    refresh,
  };
}
