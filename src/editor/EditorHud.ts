/**
 * HUD DOM do modo editor: barra superior com instruções + coords da câmera, e
 * um toast. Inicia escondida — `setVisible(true)` quando o editor é ativado.
 *
 * É opcional/conveniência (acopla ao DOM). Jogos que não querem o HUD do engine
 * podem implementar a interface {@link EditorHud} e injetar a própria versão.
 */
export interface EditorHud {
  root: HTMLDivElement;
  coords: HTMLSpanElement;
  toast: HTMLDivElement;
  setVisible(v: boolean): void;
  showToast(msg: string): void;
}

export function createEditorHud(parent: HTMLElement = document.body): EditorHud {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'padding:10px 16px',
    'background:rgba(20,20,30,0.85)',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:13px',
    'display:none',
    'justify-content:space-between',
    'align-items:center',
    'pointer-events:none',
    'user-select:none',
    'z-index:20',
    'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
  ].join(';');

  const left = document.createElement('span');
  left.innerHTML = [
    '<b>EDITOR</b>',
    'WASD/QE voar',
    'btn-direito girar',
    'Shift correr',
    'T teleporta alvo',
    'click objeto',
    '1/2/3 mover/girar/escalar',
    'F foca no selecionado',
    'K salvar cena',
    'L limpar cena',
    'Esc desseleciona',
    'F2 fecha',
  ].join(' &nbsp;•&nbsp; ');
  const coords = document.createElement('span');
  coords.textContent = '—';
  coords.style.fontFamily = 'Consolas,monospace';

  root.append(left, coords);

  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed',
    'top:60px',
    'left:50%',
    'transform:translateX(-50%)',
    'padding:8px 16px',
    'background:rgba(0,160,80,0.92)',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:14px',
    'border-radius:6px',
    'opacity:0',
    'transition:opacity 200ms ease',
    'pointer-events:none',
    'user-select:none',
    'z-index:30',
  ].join(';');

  parent.append(root, toast);

  let toastTimer: number | null = null;

  return {
    root,
    coords,
    toast,
    setVisible(v) {
      root.style.display = v ? 'flex' : 'none';
    },
    showToast(msg) {
      toast.textContent = msg;
      toast.style.opacity = '1';
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.style.opacity = '0';
        toastTimer = null;
      }, 1400);
    },
  };
}
