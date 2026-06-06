import type { Object3D, Mesh } from 'three';
import { MathUtils } from 'three';
import { setShadows } from '../scene/SceneAssets.js';
import type { EditorSelection } from './EditorSelection.js';

/** Painel de propriedades do objeto selecionado no editor. */
export interface EditorInspector {
  /** Elemento raiz (já anexado ao parent). */
  root: HTMLDivElement;
  /** Mostra/esconde o painel (tipicamente atrelado ao editor ON/OFF). */
  setVisible(v: boolean): void;
  /**
   * Relê os valores do objeto selecionado e atualiza os campos (sem pisar no
   * input em foco). Chame por frame pra refletir mudanças vindas de gameplay/
   * código, não só do gizmo.
   */
  refresh(): void;
}

/** Leitura (read-only) de um collider que casa com o objeto selecionado. */
export interface ColliderReadout {
  /** Largura total do AABB (2×halfWidth), em unidades do engine. */
  width: number;
  /** Altura total do AABB (2×halfHeight). */
  height: number;
  /** `true` = parede/chão; `false` = não-sólido (player/gatilho). */
  solid: boolean;
  /** `true` = plataforma atravessável por baixo. */
  oneWay: boolean;
}

export interface EditorInspectorOptions {
  /** Ponte de seleção compartilhada (mesma instância do ObjectEditSystem/outliner). */
  selection: EditorSelection;
  /** Onde anexar o painel. Default `document.body`. */
  parent?: HTMLElement;
  /**
   * Opcional: dado o objeto selecionado, devolve os colliders 2D associados a ele
   * (casados por sobreposição — funciona até pra collider DESACOPLADO do mesh).
   * Usado pra mostrar uma seção **Collider** (read-only) no inspector.
   */
  collidersFor?: (obj: Object3D) => ColliderReadout[];
}

interface LightLike {
  isLight?: boolean;
  intensity?: number;
  color?: { getHexString(): string; set(hex: number): void };
  shadow?: { intensity?: number };
}

/**
 * Cria o painel de **propriedades** (inspector) do modo editor. Mostra e edita o
 * objeto selecionado, reagindo a `selection.onChange` (reconstrói os campos) e
 * `selection.onTransform` (atualiza os valores ao vivo enquanto o gizmo arrasta).
 *
 * Campos:
 * - Qualquer objeto: posição (x/y/z), rotação (graus), escala (x/y/z).
 * - Sombra: projeta/recebe (via {@link setShadows}).
 * - Luz: intensidade, cor e intensidade da sombra.
 *
 * Opcional/conveniência (acopla ao DOM) — comece escondido e use `setVisible`.
 */
export function createEditorInspector(options: EditorInspectorOptions): EditorInspector {
  const { selection, parent = document.body, collidersFor } = options;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:56px',
    'right:0',
    'width:230px',
    'max-height:75vh',
    'overflow-y:auto',
    'padding:10px',
    'background:rgba(20,20,30,0.85)',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:12px',
    'display:none',
    'z-index:20',
    'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
    'box-sizing:border-box',
  ].join(';');
  parent.appendChild(root);

  // Refreshers chamados quando o gizmo move o objeto (sincroniza os inputs).
  let refreshers: Array<() => void> = [];

  function clear(): void {
    root.textContent = '';
    refreshers = [];
  }

  function numberRow(labelText: string, get: () => number, set: (v: number) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    lbl.style.cssText = 'width:54px;color:#cfd2da';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.value = fmt(get());
    input.style.cssText =
      'flex:1;width:100%;background:#11131a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px 4px;box-sizing:border-box';
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!Number.isNaN(v)) set(v);
    });
    refreshers.push(() => {
      if (document.activeElement !== input) input.value = fmt(get());
    });
    row.append(lbl, input);
    return row;
  }

  function vector3Rows(
    title: string,
    obj: { x: number; y: number; z: number },
    toDisplay = (v: number) => v,
    fromDisplay = (v: number) => v,
  ): HTMLDivElement {
    const wrap = document.createElement('div');
    const head = document.createElement('div');
    head.textContent = title;
    head.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
    wrap.append(head);
    for (const axis of ['x', 'y', 'z'] as const) {
      wrap.append(
        numberRow(
          axis.toUpperCase(),
          () => toDisplay(obj[axis]),
          (v) => {
            obj[axis] = fromDisplay(v);
          },
        ),
      );
    }
    return wrap;
  }

  function checkboxRow(labelText: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    row.append(input, lbl);
    return row;
  }

  function build(obj: Object3D | null): void {
    clear();
    if (!obj) {
      const empty = document.createElement('div');
      empty.textContent = 'Nada selecionado.';
      empty.style.cssText = 'color:#9aa0ad';
      root.append(empty);
      return;
    }

    const title = document.createElement('b');
    title.textContent = obj.name || `(${obj.type})`;
    root.append(title);

    root.append(vector3Rows('Posição', obj.position));
    // Rotação editada em graus (mais amigável que radianos).
    root.append(vector3Rows('Rotação (°)', obj.rotation, MathUtils.radToDeg, MathUtils.degToRad));
    root.append(vector3Rows('Escala', obj.scale));

    // ── Sombra ───────────────────────────────────────────────────────────────
    const shadowHead = document.createElement('div');
    shadowHead.textContent = 'Sombra';
    shadowHead.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
    root.append(shadowHead);
    const mesh = firstMesh(obj);
    root.append(
      checkboxRow(
        'Projeta sombra',
        () => mesh?.castShadow ?? obj.castShadow,
        (v) => setShadows(obj, { castShadow: v }),
      ),
      checkboxRow(
        'Recebe sombra',
        () => mesh?.receiveShadow ?? obj.receiveShadow,
        (v) => setShadows(obj, { receiveShadow: v }),
      ),
    );

    // ── Collider (read-only) ───────────────────────────────────────────────────
    // O collider pode ser uma entidade ECS DESACOPLADA do mesh (sem Object3D), por
    // isso vem de fora (casado por sobreposição), não do próprio Object3D.
    const colliders = collidersFor?.(obj) ?? [];
    if (colliders.length > 0) {
      const head = document.createElement('div');
      head.textContent = colliders.length > 1 ? `Collider (${colliders.length})` : 'Collider';
      head.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
      root.append(head);
      for (const c of colliders) {
        const kind = c.oneWay ? 'one-way' : c.solid ? 'sólido' : 'não-sólido';
        const color = c.oneWay ? '#f5a623' : c.solid ? '#3ad17a' : '#4aa3ff';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const dot = document.createElement('span');
        dot.textContent = '■';
        dot.style.cssText = `color:${color}`;
        const txt = document.createElement('span');
        txt.textContent = `${c.width.toFixed(2)} × ${c.height.toFixed(2)} · ${kind}`;
        txt.style.cssText = 'color:#cfd2da';
        row.append(dot, txt);
        root.append(row);
      }
    }

    // ── Luz (se aplicável) ─────────────────────────────────────────────────────
    const light = obj as unknown as LightLike;
    if (light.isLight) {
      const lightHead = document.createElement('div');
      lightHead.textContent = 'Luz';
      lightHead.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
      root.append(lightHead);
      if (typeof light.intensity === 'number') {
        root.append(
          numberRow(
            'Intens.',
            () => light.intensity ?? 0,
            (v) => {
              light.intensity = v;
            },
          ),
        );
      }
      if (light.color) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const lbl = document.createElement('span');
        lbl.textContent = 'Cor';
        lbl.style.cssText = 'width:54px;color:#cfd2da';
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = `#${light.color.getHexString()}`;
        picker.style.cssText = 'flex:1;height:24px;background:#11131a;border:1px solid #333;border-radius:3px';
        picker.addEventListener('input', () => light.color?.set(parseInt(picker.value.slice(1), 16)));
        row.append(lbl, picker);
        root.append(row);
      }
      if (light.shadow && typeof light.shadow.intensity === 'number') {
        root.append(
          numberRow(
            'Sombra',
            () => light.shadow?.intensity ?? 1,
            (v) => {
              if (light.shadow) light.shadow.intensity = Math.max(0, Math.min(1, v));
            },
          ),
        );
      }
    }
  }

  selection.onChange(build);
  selection.onTransform(() => {
    for (const r of refreshers) r();
  });
  build(selection.current);

  return {
    root,
    setVisible(v: boolean): void {
      root.style.display = v ? 'block' : 'none';
    },
    refresh(): void {
      for (const r of refreshers) r();
    },
  };
}

function firstMesh(obj: Object3D): Mesh | null {
  let found: Mesh | null = null;
  obj.traverse((child) => {
    if (!found && (child as Mesh).isMesh) found = child as Mesh;
  });
  return found;
}

function fmt(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}
