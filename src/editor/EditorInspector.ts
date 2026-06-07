import type { Object3D, Mesh } from 'three';
import { MathUtils } from 'three';
import { setShadows } from '../scene/SceneAssets.js';
import type { ColliderShape2D } from '../components/Collider2DComponent.js';
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

/** Estado do collider 2D de um objeto (forma + largura/altura + offset + tipo). */
export interface ColliderEditState {
  /** Forma: `box`, `circle` (raio = largura/2) ou `capsule` (vertical). */
  shape: ColliderShape2D;
  /** Largura total (2×halfWidth) — **diâmetro** em circle/capsule. */
  width: number;
  /** Altura total (2×halfHeight). Ignorada em `circle`. */
  height: number;
  /** Offset do centro em X, relativo ao objeto. */
  offsetX: number;
  /** Offset do centro em Y. */
  offsetY: number;
  /** `true` = parede/chão; `false` = não-sólido (gatilho). */
  solid: boolean;
  /** `true` = plataforma atravessável por baixo (só pousa de cima). */
  oneWay: boolean;
  /** Nº de pontos (só em `heightfield`). */
  pointCount: number;
  /** `true` = definido no CÓDIGO (read-only no editor; o código sobrescreve). */
  locked: boolean;
}

/**
 * Ponte de autoria de collider: o inspector lê/edita o collider do objeto
 * selecionado por aqui. Implementada pelo `attachEditor` contra o `World` + a
 * overlay de persistência. `get` devolve `null` se o objeto não tem collider.
 */
export interface ColliderApi {
  get(obj: Object3D): ColliderEditState | null;
  /** Adiciona um collider (tamanho default = bbox do objeto). */
  add(obj: Object3D): void;
  /** Atualiza campos do collider e persiste. */
  update(obj: Object3D, patch: Partial<Omit<ColliderEditState, 'locked' | 'pointCount'>>): void;
  /** Remove o collider do objeto. */
  remove(obj: Object3D): void;
  /**
   * Entra no **modo de desenho/edição de heightfield** pra esse objeto: cria (ou
   * reusa) um collider `heightfield` e passa a editar os pontos clicando no
   * viewport (clique adiciona, arrastar um ponto move, Backspace desfaz, Enter
   * finaliza). Ver {@link ColliderEditState.shape}.
   */
  startHeightfield(obj: Object3D): void;
  /**
   * **Auto-traça** um heightfield amostrando o topo do mesh do objeto (ponto de
   * partida; refine depois com {@link ColliderApi.startHeightfield}).
   */
  autoHeightfield(obj: Object3D): void;
}

export interface EditorInspectorOptions {
  /** Ponte de seleção compartilhada (mesma instância do ObjectEditSystem/outliner). */
  selection: EditorSelection;
  /** Onde anexar o painel. Default `document.body`. */
  parent?: HTMLElement;
  /**
   * Opcional: autoria do collider do objeto selecionado (adicionar/editar/remover).
   * Quando presente, o inspector mostra a seção **Collider** editável. Colliders
   * definidos no código vêm `locked` (read-only).
   */
  colliderApi?: ColliderApi;
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
  const { selection, parent = document.body, colliderApi } = options;

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

    // ── Collider (autorável) ───────────────────────────────────────────────────
    // O collider é uma propriedade do objeto: adicione/configure aqui se não veio
    // do código. Definido no código vem `locked` (read-only — o código sobrescreve).
    if (colliderApi) {
      const head = document.createElement('div');
      head.textContent = 'Collider';
      head.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
      root.append(head);

      const mkBtn = (label: string, onClick: () => void, danger = false): HTMLButtonElement => {
        const btn = document.createElement('button');
        btn.textContent = label;
        const bg = danger ? '#3a2a2a' : '#2a2f3a';
        const fg = danger ? '#f0b0b0' : '#fff';
        const bd = danger ? '#5a3a3a' : '#3a3f4a';
        btn.style.cssText = `width:100%;padding:5px;margin:2px 0;background:${bg};color:${fg};border:1px solid ${bd};border-radius:3px;cursor:pointer`;
        btn.addEventListener('click', onClick);
        return btn;
      };

      const cs = obj.name ? colliderApi.get(obj) : null;
      if (!obj.name) {
        const note = document.createElement('div');
        note.textContent = 'Dê um nome ao objeto pra poder adicionar um collider.';
        note.style.cssText = 'color:#9aa0ad;font-size:11px';
        root.append(note);
      } else if (cs === null) {
        root.append(
          mkBtn('+ Adicionar collider', () => {
            colliderApi.add(obj);
            build(obj);
          }),
          mkBtn('⤓ Auto-traçar chão (heightfield)', () => {
            colliderApi.autoHeightfield(obj);
            build(obj);
          }),
          mkBtn('✎ Desenhar chão (heightfield)', () => colliderApi.startHeightfield(obj)),
        );
      } else if (cs.locked) {
        const kind = cs.oneWay ? 'one-way' : cs.solid ? 'sólido' : 'não-sólido';
        const color = cs.oneWay ? '#f5a623' : cs.solid ? '#2a9dff' : '#28e0e0';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const dot = document.createElement('span');
        dot.textContent = '■';
        dot.style.cssText = `color:${color}`;
        const txt = document.createElement('span');
        const shp =
          cs.shape === 'circle' ? 'círculo'
          : cs.shape === 'capsule' ? 'cápsula'
          : cs.shape === 'heightfield' ? 'perfil'
          : 'caixa';
        txt.textContent = `${shp} ${cs.width.toFixed(2)}×${cs.height.toFixed(2)} · ${kind}`;
        txt.style.cssText = 'color:#cfd2da';
        row.append(dot, txt);
        root.append(row);
        const note = document.createElement('div');
        note.textContent = 'definido no código';
        note.style.cssText = 'color:#9aa0ad;font-size:11px';
        root.append(note);
      } else if (cs.shape === 'heightfield') {
        // Perfil de chão (heightfield): traçado clicando no viewport.
        const note = document.createElement('div');
        note.textContent = `Perfil de chão — ${cs.pointCount} ponto(s).`;
        note.style.cssText = 'color:#cfd2da;font-size:11px;margin:2px 0';
        root.append(note);
        const hint = document.createElement('div');
        hint.textContent = 'No modo desenho: clique adiciona · arraste um ponto pra mover · Backspace desfaz · Enter finaliza.';
        hint.style.cssText = 'color:#9aa0ad;font-size:11px;margin:0 0 4px';
        root.append(hint);
        root.append(
          mkBtn('✎ Editar / desenhar pontos', () => colliderApi.startHeightfield(obj)),
          mkBtn('Remover collider', () => {
            colliderApi.remove(obj);
            build(obj);
          }, true),
        );
      } else {
        // Getters re-leem o collider ao vivo (não o snapshot), pra refreshers do
        // gizmo não reverterem edições.
        const live = (k: keyof ColliderEditState): number =>
          (colliderApi.get(obj)?.[k] as number) ?? 0;

        // Forma (caixa / círculo / cápsula) — muda os labels de tamanho.
        const formRow = document.createElement('div');
        formRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const fl = document.createElement('span');
        fl.textContent = 'Forma';
        fl.style.cssText = 'width:54px;color:#cfd2da';
        const sel = document.createElement('select');
        sel.style.cssText =
          'flex:1;background:#11131a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px';
        for (const [val, label] of [['box', 'Caixa'], ['circle', 'Círculo'], ['capsule', 'Cápsula']] as const) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          if (cs.shape === val) opt.selected = true;
          sel.append(opt);
        }
        sel.addEventListener('change', () => {
          colliderApi.update(obj, { shape: sel.value as ColliderShape2D });
          build(obj); // labels de tamanho mudam conforme a forma
        });
        formRow.append(fl, sel);
        root.append(formRow);

        // Tamanho — rótulos conforme a forma.
        const widthRow = numberRow(
          cs.shape === 'box' ? 'Largura' : 'Diâmetro',
          () => live('width'),
          (v) => colliderApi.update(obj, { width: Math.max(0.01, v) }),
        );
        root.append(widthRow);
        if (cs.shape !== 'circle') {
          root.append(
            numberRow('Altura', () => live('height'), (v) => colliderApi.update(obj, { height: Math.max(0.01, v) })),
          );
        }
        root.append(
          numberRow('Offset X', () => live('offsetX'), (v) => colliderApi.update(obj, { offsetX: v })),
          numberRow('Offset Y', () => live('offsetY'), (v) => colliderApi.update(obj, { offsetY: v })),
          checkboxRow('Sólido', () => colliderApi.get(obj)?.solid ?? true, (v) => colliderApi.update(obj, { solid: v })),
          checkboxRow('One-way', () => colliderApi.get(obj)?.oneWay ?? false, (v) => colliderApi.update(obj, { oneWay: v })),
        );
        const rm = document.createElement('button');
        rm.textContent = 'Remover collider';
        rm.style.cssText =
          'width:100%;padding:5px;margin:4px 0;background:#3a2a2a;color:#f0b0b0;border:1px solid #5a3a3a;border-radius:3px;cursor:pointer';
        rm.addEventListener('click', () => {
          colliderApi.remove(obj);
          build(obj);
        });
        root.append(rm);
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
