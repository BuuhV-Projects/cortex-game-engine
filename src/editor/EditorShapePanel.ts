import { SHAPES, type ShapeKind } from '../probuilder/shapes.js';

/**
 * Painel "Formas" do editor (blockout — ADR-0071): grade de botões com as formas
 * paramétricas (cubo/escada/rampa/arco/parede/…); clicar cria um nó `mesh` na cena
 * (o chamador instancia e persiste na overlay, como o {@link EditorAddPanel}). É a
 * paleta de blockout estilo ProBuilder. Opcional/conveniência (DOM), opt-in via
 * `setVisible`.
 */
export interface EditorShapePanel {
  root: HTMLDivElement;
  setVisible(v: boolean): void;
}

export interface EditorShapePanelOptions {
  /** Chamado ao clicar numa forma — recebe o tipo (`cube`/`stairs`/…). */
  onAddShape: (kind: ShapeKind) => void;
  /** Chamado ao clicar em "Desenhar no chão" — arma o desenho de caixa (ADR-0071). */
  onDrawBox?: () => void;
  /** Chamado ao clicar em "Vegetação" — cria um nó `vegetation` e liga o pincel (ADR-0077). */
  onAddVegetation?: () => void;
  parent?: HTMLElement;
}

/** Ordem de exibição: básicas primeiro, depois arquitetura. */
const ORDER: ShapeKind[] = ['cube', 'plane', 'cylinder', 'sphere', 'cone', 'stairs', 'ramp', 'arch', 'wallOpening'];

export function createEditorShapePanel(options: EditorShapePanelOptions): EditorShapePanel {
  const { onAddShape, onDrawBox, onAddVegetation, parent = document.body } = options;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'left:0',
    'bottom:34vh',
    'width:220px',
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
  title.textContent = 'Formas (blockout)';
  const grid = document.createElement('div');
  grid.style.cssText = 'margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px';

  for (const kind of ORDER) {
    const def = SHAPES[kind];
    const btn = document.createElement('button');
    btn.textContent = def.label;
    btn.title = `Adicionar ${def.label}`;
    btn.style.cssText = [
      'padding:6px 4px',
      'border:1px solid #2a2c36',
      'border-radius:4px',
      'background:#20222b',
      'color:#fff',
      'cursor:pointer',
      'font-size:11px',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');
    btn.addEventListener('mouseenter', () => (btn.style.background = '#2a2d38'));
    btn.addEventListener('mouseleave', () => (btn.style.background = '#20222b'));
    btn.addEventListener('click', () => onAddShape(kind));
    grid.append(btn);
  }

  root.append(title, grid);

  // "Desenhar no chão" (ProBuilder New Shape): arraste a base no terreno + puxe a altura.
  if (onDrawBox) {
    const draw = document.createElement('button');
    draw.textContent = '✏️ Desenhar no chão';
    draw.title = 'Arraste a base no terreno e mova pra cima pra criar uma caixa';
    draw.style.cssText = [
      'margin-top:6px',
      'width:100%',
      'padding:7px 4px',
      'border:1px solid #3b6fd4',
      'border-radius:4px',
      'background:#26406f',
      'color:#fff',
      'cursor:pointer',
      'font-size:12px',
    ].join(';');
    draw.addEventListener('click', onDrawBox);
    root.append(draw);
  }


  // "Vegetação": cria o nó + liga o pincel; o MODELO (árvore/arbusto/…) se escolhe no
  // Inspector (modal com preview). Um único botão — sem grama/árvore redundante (ADR-0077).
  if (onAddVegetation) {
    const b = document.createElement('button');
    b.textContent = '🌿 Vegetação';
    b.title = 'Cria vegetação e liga o pincel — escolha o modelo no Inspector';
    b.style.cssText = 'margin-top:4px;width:100%;padding:7px 4px;border:1px solid #3f7d3a;border-radius:4px;background:#2c4a2a;color:#fff;cursor:pointer;font-size:12px';
    b.addEventListener('click', () => onAddVegetation());
    root.append(b);
  }

  parent.appendChild(root);

  return {
    root,
    setVisible(v: boolean): void {
      root.style.display = v ? 'block' : 'none';
    },
  };
}
