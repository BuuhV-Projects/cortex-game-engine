import type { Object3D } from 'three';
import type { EditorSelection } from './EditorSelection.js';

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
}

/**
 * Cria o painel de **hierarquia** do modo editor: lista os objetos da cena
 * (filhos diretos dos `editRoots`, exceto internos do editor). Clicar num item
 * o **seleciona** (via `selection.requestSelect`, que o {@link ObjectEditSystem}
 * atende atacando o gizmo) e o **enquadra** (via `onFocus`). O item selecionado
 * fica destacado, reagindo a `selection.onChange`.
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
  const { editRoots, selection, onFocus, parent = document.body } = options;

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

  const list = document.createElement('div');
  root.append(header, list);
  parent.appendChild(root);

  // Mapa item DOM → objeto, pra destacar a seleção atual.
  const rows = new Map<Object3D, HTMLDivElement>();

  function isInternal(obj: Object3D): boolean {
    return obj.userData?.['editorInternal'] === true;
  }

  function label(obj: Object3D): string {
    return obj.name || `(${obj.type})`;
  }

  function refresh(): void {
    list.textContent = '';
    rows.clear();
    for (const editRoot of editRoots) {
      for (const child of editRoot.children) {
        if (isInternal(child)) continue;
        const item = document.createElement('div');
        item.textContent = label(child);
        item.style.cssText =
          'padding:3px 6px;border-radius:3px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        item.addEventListener('mouseenter', () => {
          if (selection.current !== child) item.style.background = 'rgba(255,255,255,0.08)';
        });
        item.addEventListener('mouseleave', () => {
          if (selection.current !== child) item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
          selection.requestSelect(child);
          onFocus?.(child);
        });
        list.appendChild(item);
        rows.set(child, item);
      }
    }
    highlight(selection.current);
  }

  function highlight(current: Object3D | null): void {
    for (const [obj, item] of rows) {
      item.style.background = obj === current ? 'rgba(90,140,255,0.45)' : 'transparent';
    }
  }

  refreshBtn.addEventListener('click', refresh);
  selection.onChange(highlight);

  return {
    root,
    setVisible(v: boolean): void {
      root.style.display = v ? 'block' : 'none';
    },
    refresh,
  };
}
