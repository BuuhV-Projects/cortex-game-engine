/**
 * **Seletor de textura em modal** (grade de miniaturas) — usado pra escolher a
 * superfície da estrada (ADR-0072), mas genérico. Mostra um grid de previews; clicar
 * num item dispara `onPick(value)` e fecha. Esc ou clique no fundo fecham.
 *
 * É chrome de viewport (DOM overlay): aparece sobre o canvas (inclusive no modo bridge
 * da IDE, pois o modal vive no frame do jogo). As miniaturas usam as URLs dos assets
 * do projeto (servidas pelo Vite).
 */
export interface TextureItem<T> {
  /** Rótulo exibido sob a miniatura. */
  name: string;
  /** URL da imagem de preview (diffuse). */
  thumb: string;
  /** Valor entregue ao `onPick` (ex.: `{ diffuse, normal }`). */
  value: T;
}

export interface EditorTexturePicker {
  root: HTMLDivElement;
  /** Abre o modal com os itens; `onPick` recebe o `value` do escolhido. */
  open<T>(title: string, items: TextureItem<T>[], onPick: (value: T) => void): void;
  close(): void;
}

export function createEditorTexturePicker(parent: HTMLElement = document.body): EditorTexturePicker {
  const backdrop = document.createElement('div');
  backdrop.style.cssText = [
    'position:fixed', 'inset:0', 'display:none', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.55)', 'z-index:2147483010',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(720px,86vw)', 'max-height:80vh', 'display:flex', 'flex-direction:column',
    'background:#1b1d24', 'border:1px solid #2c2f3a', 'border-radius:10px',
    'box-shadow:0 12px 48px rgba(0,0,0,0.6)', 'overflow:hidden',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #2c2f3a';
  const title = document.createElement('b');
  title.style.cssText = 'color:#fff;font-size:14px';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:transparent;border:none;color:#cfd3dc;font-size:16px;cursor:pointer;padding:2px 6px';
  header.append(title, closeBtn);

  // Caixa de pesquisa: filtra a grade pelo nome (case-insensitive) ao digitar.
  const searchRow = document.createElement('div');
  searchRow.style.cssText = 'padding:10px 16px 0';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Pesquisar textura…';
  search.style.cssText = [
    'width:100%', 'box-sizing:border-box', 'padding:7px 10px',
    'background:#13151b', 'border:1px solid #2c2f3a', 'border-radius:6px',
    'color:#e6e8ee', 'font-size:12px', 'outline:none',
  ].join(';');
  search.addEventListener('focus', () => (search.style.borderColor = '#3b6fd4'));
  search.addEventListener('blur', () => (search.style.borderColor = '#2c2f3a'));
  searchRow.append(search);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;padding:14px 16px;overflow-y:auto';

  panel.append(header, searchRow, grid);
  backdrop.append(panel);
  parent.appendChild(backdrop);

  // Estado do modal atual (pra re-renderizar ao filtrar sem reabrir).
  let currentItems: TextureItem<unknown>[] = [];
  let currentOnPick: (value: unknown) => void = () => {};

  /** (Re)desenha a grade com os itens cujo nome casa com a query. */
  const renderGrid = (query: string): void => {
    grid.textContent = '';
    const q = query.trim().toLowerCase();
    const shown = q ? currentItems.filter((it) => it.name.toLowerCase().includes(q)) : currentItems;
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = currentItems.length === 0 ? 'Nenhuma textura disponível' : `Nada encontrado para "${query.trim()}"`;
      empty.style.cssText = 'color:#9aa0ad;font-size:12px;grid-column:1/-1';
      grid.append(empty);
      return;
    }
    for (const it of shown) {
      const card = document.createElement('button');
      card.title = it.name;
      card.style.cssText = [
        'display:flex', 'flex-direction:column', 'gap:4px', 'padding:6px',
        'background:#23262f', 'border:1px solid #2c2f3a', 'border-radius:6px',
        'cursor:pointer', 'color:#cfd3dc', 'font-size:10px', 'text-align:center',
      ].join(';');
      const img = document.createElement('img');
      img.src = it.thumb;
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;background:#0e0f13';
      const label = document.createElement('span');
      label.textContent = it.name;
      label.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      card.append(img, label);
      card.addEventListener('mouseenter', () => (card.style.borderColor = '#3b6fd4'));
      card.addEventListener('mouseleave', () => (card.style.borderColor = '#2c2f3a'));
      card.addEventListener('click', () => {
        currentOnPick(it.value);
        close();
      });
      grid.append(card);
    }
  };

  const close = (): void => {
    backdrop.style.display = 'none';
    grid.textContent = '';
    currentItems = [];
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.style.display !== 'none') close();
  });
  search.addEventListener('input', () => renderGrid(search.value));

  return {
    root: backdrop,
    close,
    open<T>(t: string, items: TextureItem<T>[], onPick: (value: T) => void): void {
      title.textContent = t;
      currentItems = items as TextureItem<unknown>[];
      currentOnPick = onPick as (value: unknown) => void;
      search.value = '';
      renderGrid('');
      backdrop.style.display = 'flex';
      // Foco na busca pra já digitar (listas grandes — Road Architect tem dezenas).
      setTimeout(() => search.focus(), 0);
    },
  };
}
