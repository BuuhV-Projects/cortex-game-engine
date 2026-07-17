import type { FieldValue, InspectorField, InspectorModel, OutlinerModel } from './EditorModel.js';

/**
 * Renderizadores **DOM genéricos** do {@link InspectorModel}/{@link OutlinerModel}
 * (ADR-0056). São usados pelos painéis **in-canvas** do engine (projeto
 * standalone); a IDE tem seu próprio renderizador nativo do mesmo modelo. Assim a
 * descrição (em `EditorModel`) é a fonte única e não há dois inspectors.
 */

const PANEL_INPUT =
  'background:#11131a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px 4px;box-sizing:border-box';
const HEAD = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';

/** View do inspector: renderiza o modelo e atualiza valores sem pisar no foco. */
export interface InspectorView {
  root: HTMLDivElement;
  /** Reconstrói o painel a partir do modelo. */
  render(model: InspectorModel): void;
  /** Atualiza só os valores dos campos existentes (sem rebuild), pulando o input em foco. */
  refreshValues(model: InspectorModel): void;
  /** `true` se a estrutura (ids + kinds) do modelo bate com o renderizado agora. */
  sameStructure(model: InspectorModel): boolean;
}

export interface InspectorViewCallbacks {
  /** Disparado por inputs (vec3/number/checkbox/select/color). */
  onInput(id: string, value: FieldValue): void;
  /** Disparado por botões. */
  onButton(id: string): void;
}

function structureKey(model: InspectorModel): string {
  const parts: string[] = [model.empty ? 'E' : 'F'];
  for (const s of model.sections) for (const f of s.fields) {
    // Opções de select entram na chave: uma lista dinâmica (ex.: texturas do
    // projeto após importar) precisa de rebuild — o updater só troca o VALOR.
    const dyn = f.kind === 'select' ? `|${f.options.map((o) => o.value).join('§')}` : '';
    parts.push(`${f.id}|${f.kind}${dyn}`);
  }
  return parts.join(',');
}

/** Cria a view DOM do inspector a partir do modelo declarativo. */
export function createInspectorView(cb: InspectorViewCallbacks): InspectorView {
  const root = document.createElement('div');
  // Updaters por campo (atualizam valor sem rebuild). Chave = field.id.
  let updaters = new Map<string, (f: InspectorField) => void>();
  let lastKey = '';

  function numberInput(value: number, step: number | undefined, onChange: (v: number) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(step ?? 0.1);
    input.value = fmt(value);
    input.style.cssText = `flex:1;width:100%;${PANEL_INPUT}`;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!Number.isNaN(v)) onChange(v);
    });
    return input;
  }

  function buildField(f: InspectorField): HTMLElement {
    switch (f.kind) {
      case 'vec3': {
        const wrap = document.createElement('div');
        const head = document.createElement('div');
        head.textContent = f.label;
        head.style.cssText = HEAD;
        wrap.append(head);
        const inputs: HTMLInputElement[] = [];
        const axes = ['X', 'Y', 'Z'] as const;
        const emit = (): void => cb.onInput(f.id, [
          parseFloat(inputs[0]!.value) || 0,
          parseFloat(inputs[1]!.value) || 0,
          parseFloat(inputs[2]!.value) || 0,
        ]);
        for (let i = 0; i < 3; i++) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
          const lbl = document.createElement('span');
          lbl.textContent = axes[i]!;
          lbl.style.cssText = 'width:54px;color:#cfd2da';
          const input = numberInput(f.value[i]!, f.step, emit);
          inputs.push(input);
          row.append(lbl, input);
          wrap.append(row);
        }
        updaters.set(f.id, (nf) => {
          if (nf.kind !== 'vec3') return;
          for (let i = 0; i < 3; i++) {
            if (document.activeElement !== inputs[i]) inputs[i]!.value = fmt(nf.value[i]!);
          }
        });
        return wrap;
      }
      case 'number': {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const lbl = document.createElement('span');
        lbl.textContent = f.label;
        lbl.style.cssText = 'width:54px;color:#cfd2da';
        const input = numberInput(f.value, f.step, (v) => cb.onInput(f.id, v));
        row.append(lbl, input);
        updaters.set(f.id, (nf) => {
          if (nf.kind === 'number' && document.activeElement !== input) input.value = fmt(nf.value);
        });
        return row;
      }
      case 'checkbox': {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = f.value;
        input.addEventListener('change', () => cb.onInput(f.id, input.checked));
        const lbl = document.createElement('span');
        lbl.textContent = f.label;
        row.append(input, lbl);
        updaters.set(f.id, (nf) => {
          if (nf.kind === 'checkbox' && document.activeElement !== input) input.checked = nf.value;
        });
        return row;
      }
      case 'select': {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const lbl = document.createElement('span');
        lbl.textContent = f.label;
        lbl.style.cssText = 'width:54px;color:#cfd2da';
        const sel = document.createElement('select');
        sel.style.cssText = `flex:1;${PANEL_INPUT}`;
        for (const opt of f.options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === f.value) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener('change', () => cb.onInput(f.id, sel.value));
        row.append(lbl, sel);
        updaters.set(f.id, (nf) => {
          if (nf.kind === 'select' && document.activeElement !== sel) sel.value = nf.value;
        });
        return row;
      }
      case 'color': {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const lbl = document.createElement('span');
        lbl.textContent = f.label;
        lbl.style.cssText = 'width:54px;color:#cfd2da';
        const input = document.createElement('input');
        input.type = 'color';
        input.value = f.value;
        input.style.cssText = 'flex:1;height:24px;background:#11131a;border:1px solid #333;border-radius:3px';
        input.addEventListener('input', () => cb.onInput(f.id, input.value));
        row.append(lbl, input);
        updaters.set(f.id, (nf) => {
          if (nf.kind === 'color' && document.activeElement !== input) input.value = nf.value;
        });
        return row;
      }
      case 'button': {
        const btn = document.createElement('button');
        btn.textContent = f.label;
        const danger = f.variant === 'danger';
        const bg = danger ? '#3a2a2a' : '#2a2f3a';
        const fg = danger ? '#f0b0b0' : '#fff';
        const bd = danger ? '#5a3a3a' : '#3a3f4a';
        btn.style.cssText = `width:100%;padding:5px;margin:2px 0;background:${bg};color:${fg};border:1px solid ${bd};border-radius:3px;cursor:pointer`;
        btn.addEventListener('click', () => cb.onButton(f.id));
        return btn;
      }
      case 'note': {
        const note = document.createElement('div');
        note.textContent = f.text;
        note.style.cssText = `font-size:11px;margin:2px 0;color:${f.tone === 'info' ? '#cfd2da' : '#9aa0ad'}`;
        return note;
      }
      case 'text': {
        // Texto livre (ex.: renomear objeto) — commit no Enter/blur (evento change),
        // não a cada tecla (renomear por keystroke migraria o overlay no meio da digitação).
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const lbl = document.createElement('span');
        lbl.textContent = f.label;
        lbl.style.cssText = 'width:54px;color:#cfd2da';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = f.value;
        if (f.placeholder) input.placeholder = f.placeholder;
        input.style.cssText =
          'flex:1;min-width:0;background:#1a1d24;color:#fff;border:1px solid #3a3f4a;border-radius:3px;padding:3px 6px';
        input.addEventListener('change', () => cb.onInput(f.id, input.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          e.stopPropagation(); // teclas de atalho do editor não roubam a digitação
        });
        row.append(lbl, input);
        updaters.set(f.id, (nf) => {
          if (nf.kind === 'text' && document.activeElement !== input) input.value = nf.value;
        });
        return row;
      }
      case 'file': {
        // Botão que abre o file picker NESTE frame (clique direto = user activation)
        // e entrega o arquivo lido como JSON { name, dataUrl } pro handler.
        const btn = document.createElement('button');
        btn.textContent = f.label;
        btn.style.cssText =
          'width:100%;padding:5px;margin:2px 0;background:#2a2f3a;color:#fff;border:1px solid #3a3f4a;border-radius:3px;cursor:pointer';
        const input = document.createElement('input');
        input.type = 'file';
        if (f.accept) input.accept = f.accept;
        input.style.display = 'none';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            cb.onInput(f.id, JSON.stringify({ name: file.name, dataUrl: String(reader.result) }));
            input.value = '';
          };
          reader.readAsDataURL(file);
        });
        btn.addEventListener('click', () => input.click());
        const wrap = document.createElement('div');
        wrap.append(btn, input);
        return wrap;
      }
    }
  }

  function render(model: InspectorModel): void {
    root.textContent = '';
    updaters = new Map();
    lastKey = structureKey(model);
    if (model.empty) {
      const empty = document.createElement('div');
      empty.textContent = 'Nada selecionado.';
      empty.style.cssText = 'color:#9aa0ad';
      root.append(empty);
      return;
    }
    const title = document.createElement('b');
    title.textContent = model.title;
    root.append(title);
    for (const section of model.sections) {
      if (section.title) {
        const head = document.createElement('div');
        head.textContent = section.title;
        head.style.cssText = HEAD;
        root.append(head);
      }
      for (const f of section.fields) root.append(buildField(f));
    }
  }

  function refreshValues(model: InspectorModel): void {
    for (const s of model.sections) for (const f of s.fields) updaters.get(f.id)?.(f);
  }

  return {
    root,
    render,
    refreshValues,
    sameStructure: (model) => structureKey(model) === lastKey,
  };
}

/** View da hierarquia: lista os itens e destaca o selecionado. */
export interface OutlinerView {
  root: HTMLDivElement;
  render(model: OutlinerModel): void;
}

export interface OutlinerViewCallbacks {
  /** `additive` = Ctrl/Cmd+click (multi-seleção: alterna o item no conjunto). */
  onSelect(id: string, additive: boolean): void;
  onFocus(id: string): void;
}

/** Cria a view DOM da hierarquia a partir do modelo declarativo. */
export function createOutlinerView(cb: OutlinerViewCallbacks): OutlinerView {
  const root = document.createElement('div');
  function render(model: OutlinerModel): void {
    root.textContent = '';
    for (const item of model.items) {
      const el = document.createElement('div');
      el.textContent = item.label;
      const sel = item.selected;
      el.style.cssText = `padding:3px 6px;border-radius:3px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${sel ? 'rgba(90,140,255,0.45)' : 'transparent'}`;
      el.addEventListener('mouseenter', () => {
        if (!item.selected) el.style.background = 'rgba(255,255,255,0.08)';
      });
      el.addEventListener('mouseleave', () => {
        if (!item.selected) el.style.background = 'transparent';
      });
      el.addEventListener('click', (e) => {
        const additive = e.ctrlKey || e.metaKey;
        cb.onSelect(item.id, additive);
        // Ctrl+click não enquadra a câmera — você está montando um conjunto,
        // não navegando até o objeto.
        if (!additive) cb.onFocus(item.id);
      });
      root.append(el);
    }
  }
  return { root, render };
}

function fmt(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}
