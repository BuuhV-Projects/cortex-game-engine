/** Painel "Add" do editor: lista assets `.glb` e adiciona o clicado à cena. */
export interface EditorAddPanel {
  root: HTMLDivElement;
  setVisible(v: boolean): void;
  /** Define a lista de assets (caminhos `.glb`) a oferecer. */
  setAssets(assets: string[]): void;
}

export interface EditorAddPanelOptions {
  /** Chamado ao clicar num asset — recebe o caminho do `.glb` (ex.: `assets/tree.glb`). */
  onAdd: (url: string) => void;
  parent?: HTMLElement;
}

/**
 * Painel de adição de assets do modo editor (canto inferior-esquerdo): lista os
 * `.glb` disponíveis; clicar adiciona o modelo à cena (o chamador instancia e
 * persiste na overlay). É a base do "arrastar pra adicionar" — começa como
 * clique-pra-adicionar. Opcional/conveniência (DOM), opt-in via `setVisible`.
 */
export function createEditorAddPanel(options: EditorAddPanelOptions): EditorAddPanel {
  const { onAdd, parent = document.body } = options;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:0',
    'width:220px',
    'max-height:32vh',
    'overflow-y:auto',
    'padding:8px',
    'background:#15161c',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:12px',
    'display:none',
    'z-index:2147483000',
    'box-shadow:0 -2px 8px rgba(0,0,0,0.4)',
    'box-sizing:border-box',
  ].join(';');

  const title = document.createElement('b');
  title.textContent = 'Adicionar asset';
  const list = document.createElement('div');
  list.style.cssText = 'margin-top:6px';
  root.append(title, list);
  parent.appendChild(root);

  function setAssets(assets: string[]): void {
    list.textContent = '';
    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Nenhum .glb em assets/';
      empty.style.cssText = 'color:#9aa0ad;margin-top:4px';
      list.append(empty);
      return;
    }
    for (const url of assets) {
      const item = document.createElement('div');
      item.textContent = url.replace(/^assets\//, '').replace(/\.glb$/i, '');
      item.title = url;
      item.style.cssText =
        'padding:3px 6px;border-radius:3px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      item.addEventListener('mouseenter', () => (item.style.background = 'rgba(255,255,255,0.08)'));
      item.addEventListener('mouseleave', () => (item.style.background = 'transparent'));
      item.addEventListener('click', () => onAdd(url));
      list.append(item);
    }
  }

  return {
    root,
    setVisible(v: boolean): void {
      root.style.display = v ? 'block' : 'none';
    },
    setAssets,
  };
}
