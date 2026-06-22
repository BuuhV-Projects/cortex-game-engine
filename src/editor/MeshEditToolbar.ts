/**
 * Barra flutuante de **edição de malha** (blockout/ProBuilder — ADR-0071), estilo
 * a toolbar do ProBuilder da Unity. Aparece no topo do viewport quando uma malha
 * (`mesh`) está selecionada e deixa alternar Objeto/Vértice/Aresta/Face + Extrudar
 * com um clique — sem depender de atalho de teclado nem de achar a seção no
 * Inspector.
 *
 * É **chrome de viewport** (como o gizmo): NÃO é escondida no modo bridge (IDE) —
 * some só quando o editor sai do ar ou nada de malha está selecionado.
 */
export type MeshToolbarMode = 'object' | 'vertex' | 'edge' | 'face';

export interface MeshEditToolbarState {
  /** Mostrar a barra? (editor ativo + uma malha selecionada). */
  visible: boolean;
  /** Modo atual. */
  mode: MeshToolbarMode;
  /** Há face selecionada (habilita Extrudar)? */
  canExtrude: boolean;
}

export interface MeshEditToolbar {
  root: HTMLDivElement;
  update(state: MeshEditToolbarState): void;
}

export interface MeshEditToolbarOptions {
  onMode: (mode: MeshToolbarMode) => void;
  onExtrude: () => void;
  parent?: HTMLElement;
}

const MODES: { mode: MeshToolbarMode; label: string; hint: string }[] = [
  { mode: 'object', label: '◻ Objeto', hint: 'Mover/girar/escalar a malha inteira (gizmo normal)' },
  { mode: 'vertex', label: '• Vértice', hint: 'Selecionar e mover vértices (tecla 1)' },
  { mode: 'edge', label: '╱ Aresta', hint: 'Selecionar e mover arestas (tecla 2)' },
  { mode: 'face', label: '▦ Face', hint: 'Selecionar/mover/extrudar faces (tecla 3)' },
];

export function createMeshEditToolbar(options: MeshEditToolbarOptions): MeshEditToolbar {
  const { onMode, onExtrude, parent = document.body } = options;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:52px',
    'left:50%',
    'transform:translateX(-50%)',
    'display:none',
    'gap:4px',
    'align-items:center',
    'padding:5px 6px',
    'background:#1c1e26',
    'border:1px solid #2c2f3a',
    'border-radius:8px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.45)',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:12px',
    'z-index:2147483002',
    'user-select:none',
  ].join(';');

  const mkBtn = (label: string, hint: string, on: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = hint;
    b.style.cssText = [
      'padding:6px 10px',
      'border:1px solid transparent',
      'border-radius:5px',
      'background:transparent',
      'color:#cfd3dc',
      'cursor:pointer',
      'font-size:12px',
      'white-space:nowrap',
    ].join(';');
    b.addEventListener('click', on);
    return b;
  };

  const modeButtons = new Map<MeshToolbarMode, HTMLButtonElement>();
  for (const m of MODES) {
    const b = mkBtn(m.label, m.hint, () => onMode(m.mode));
    modeButtons.set(m.mode, b);
    root.append(b);
  }

  const sep = document.createElement('div');
  sep.style.cssText = 'width:1px;height:20px;background:#2c2f3a;margin:0 2px';
  root.append(sep);

  const extrudeBtn = mkBtn('⬆ Extrudar', 'Extrudar a face selecionada (tecla E)', onExtrude);
  root.append(extrudeBtn);

  parent.appendChild(root);

  let last = '';
  return {
    root,
    update(state: MeshEditToolbarState): void {
      const key = `${state.visible}|${state.mode}|${state.canExtrude}`;
      if (key === last) return; // evita thrash de estilo todo frame
      last = key;
      root.style.display = state.visible ? 'flex' : 'none';
      if (!state.visible) return;
      for (const [mode, btn] of modeButtons) {
        const active = mode === state.mode;
        btn.style.background = active ? '#3b6fd4' : 'transparent';
        btn.style.color = active ? '#fff' : '#cfd3dc';
        btn.style.borderColor = active ? '#5a86e0' : 'transparent';
      }
      extrudeBtn.style.opacity = state.mode === 'face' && state.canExtrude ? '1' : '0.4';
      extrudeBtn.style.pointerEvents = state.mode === 'face' && state.canExtrude ? 'auto' : 'none';
    },
  };
}
