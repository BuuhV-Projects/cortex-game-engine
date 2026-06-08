import type { Object3D, Mesh } from 'three';
import { MathUtils } from 'three';
import { setShadows, setMatte, clearMatte, isMatte } from '../scene/SceneAssets.js';
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

/**
 * Ponte de autoria do estado **fosco (matte)** do objeto: o inspector lê/grava por
 * aqui. Implementada pelo `attachEditor` contra a overlay (persiste em
 * `data.matte[nome]`), pra o look cartoon ficar autorado (sobrevive ao reload).
 * Sem ela, o inspector ainda liga/desliga, mas só em runtime.
 */
export interface MatteApi {
  get(obj: Object3D): boolean;
  set(obj: Object3D, value: boolean): void;
}

/** Estado de animação do objeto selecionado (clipes do `.glb`). */
export interface AnimationEditState {
  /** Nomes dos clipes disponíveis. */
  clips: string[];
  /** Clipe tocando agora, ou `null`. */
  current: string | null;
  /** Repetir em loop. */
  loop: boolean;
  /** Velocidade. */
  speed: number;
}

/**
 * Ponte de autoria de **animação** do objeto: o inspector escolhe o clipe, dá
 * play/stop e ajusta loop/velocidade por aqui. Implementada pelo `attachEditor`
 * contra o `SceneAnimator` (em `userData.cortexAnim`) + a overlay (persiste em
 * `data.animation[id]`). `get` devolve `null` se o objeto não tem animação.
 */
export interface AnimationApi {
  get(obj: Object3D): AnimationEditState | null;
  /** Toca um clipe (e persiste como autoplay). */
  play(obj: Object3D, clip: string): void;
  /** Para a animação (persiste autoplay:false). */
  stop(obj: Object3D): void;
  setLoop(obj: Object3D, loop: boolean): void;
  setSpeed(obj: Object3D, speed: number): void;
}

/** Estado do mapa **ação→clipe** do player selecionado. */
export interface PlayerAnimationsState {
  /** Ações a exibir (idle/walk/run/jump/fall/land). */
  actions: string[];
  /** Clipes disponíveis no modelo. */
  clips: string[];
  /** Mapa atual ação→clipe. */
  map: Record<string, string>;
}

/**
 * Ponte de autoria do **mapa de animações por ação do player** (idle/run/jump/…).
 * Implementada pelo `attachEditor` contra o `PlayerAnimatorComponent` + a overlay
 * (`data.playerAnimations[id]`). `get` devolve `null` se o objeto não é um player
 * animado.
 */
export interface PlayerAnimationsApi {
  get(obj: Object3D): PlayerAnimationsState | null;
  /** Mapeia uma ação a um clipe (`clip` vazio = desmapeia) e persiste. */
  set(obj: Object3D, action: string, clip: string): void;
  /** Toca um clipe pra PREVIEW (loop, sem persistir). `''` = ignora. */
  preview(obj: Object3D, clip: string): void;
  /** Para a preview. */
  stop(obj: Object3D): void;
  /** Infere o mapa pelos NOMES dos clipes e GRAVA (preenche só o que falta). */
  autoMap(obj: Object3D): void;
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
  /** Opcional: autoria/persistência do toggle Fosco (matte). Ver {@link MatteApi}. */
  matteApi?: MatteApi;
  /** Opcional: controle/persistência de animação (escolher clipe, play/stop). Ver {@link AnimationApi}. */
  animationApi?: AnimationApi;
  /** Opcional: mapa ação→clipe do player (idle/run/jump/…). Ver {@link PlayerAnimationsApi}. */
  playerAnimationsApi?: PlayerAnimationsApi;
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
  const { selection, parent = document.body, colliderApi, matteApi, animationApi, playerAnimationsApi } = options;

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:56px',
    'right:0',
    'width:230px',
    'max-height:75vh',
    'overflow-y:auto',
    'padding:10px',
    'background:#15161c',
    'color:#fff',
    'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:12px',
    'display:none',
    'z-index:2147483000',
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

    // ── Material ───────────────────────────────────────────────────────────────
    // Fosco (matte): mata o brilho PBR → look cartoon/desenho. Ligar/desligar ao
    // vivo (clearMatte restaura os valores originais cacheados).
    const matHead = document.createElement('div');
    matHead.textContent = 'Material';
    matHead.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
    root.append(matHead);
    root.append(
      checkboxRow(
        'Fosco (matte)',
        () => (matteApi ? matteApi.get(obj) : isMatte(obj)),
        (v) => (matteApi ? matteApi.set(obj, v) : v ? setMatte(obj) : clearMatte(obj)),
      ),
    );

    // ── Animação (modelos .glb com clipes) ───────────────────────────────────────
    const animState = animationApi?.get(obj) ?? null;
    if (animationApi && animState && animState.clips.length > 0) {
      const head = document.createElement('div');
      head.textContent = 'Animação';
      head.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
      root.append(head);

      // Dropdown de clipes — trocar TOCA o clipe.
      const sel = document.createElement('select');
      sel.style.cssText =
        'width:100%;background:#11131a;color:#fff;border:1px solid #333;border-radius:3px;padding:3px 4px;box-sizing:border-box;margin:2px 0';
      for (const name of animState.clips) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === animState.current) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener('change', () => animationApi.play(obj, sel.value));
      root.append(sel);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin:3px 0';
      const btnCss =
        'flex:1;padding:4px;background:#2a2f3a;color:#fff;border:1px solid #3a3f4a;border-radius:3px;cursor:pointer';
      const playBtn = document.createElement('button');
      playBtn.textContent = '▶ Tocar';
      playBtn.style.cssText = btnCss;
      playBtn.addEventListener('click', () => animationApi.play(obj, sel.value));
      const stopBtn = document.createElement('button');
      stopBtn.textContent = '⏹ Parar';
      stopBtn.style.cssText = btnCss;
      stopBtn.addEventListener('click', () => animationApi.stop(obj));
      row.append(playBtn, stopBtn);
      root.append(row);

      root.append(
        checkboxRow('Loop', () => animationApi.get(obj)?.loop ?? true, (v) => animationApi.setLoop(obj, v)),
        numberRow('Velocidade', () => animationApi.get(obj)?.speed ?? 1, (v) => animationApi.setSpeed(obj, v)),
      );
    }

    // ── Ações do player (mapa ação→clipe) ────────────────────────────────────────
    const pa = playerAnimationsApi?.get(obj) ?? null;
    if (playerAnimationsApi && pa) {
      const head = document.createElement('div');
      head.textContent = 'Ações do player';
      head.style.cssText = 'margin:8px 0 2px;color:#9aa0ad;font-weight:600';
      root.append(head);

      const sels: Record<string, HTMLSelectElement> = {};
      // "Auto-mapear" infere pelos nomes e GRAVA (não fica escondido).
      const autoBtn = document.createElement('button');
      autoBtn.textContent = '🔎 Auto-mapear pelos nomes';
      autoBtn.title = 'Preenche as ações vazias pelos nomes dos clipes e salva';
      autoBtn.style.cssText =
        'width:100%;padding:4px;margin:2px 0;background:#2a2f3a;color:#fff;border:1px solid #3a3f4a;border-radius:3px;cursor:pointer';
      autoBtn.addEventListener('click', () => {
        playerAnimationsApi.autoMap(obj);
        const next = playerAnimationsApi.get(obj);
        if (next) for (const [a, s] of Object.entries(sels)) s.value = next.map[a] ?? '';
      });
      root.append(autoBtn);

      for (const action of pa.actions) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
        const lbl = document.createElement('span');
        lbl.textContent = action;
        lbl.style.cssText = 'width:54px;color:#cfd2da';
        const sel = document.createElement('select');
        sel.style.cssText =
          'flex:1;width:100%;background:#11131a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px 4px;box-sizing:border-box';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '—';
        sel.append(none);
        for (const name of pa.clips) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          if (pa.map[action] === name) opt.selected = true;
          sel.append(opt);
        }
        sels[action] = sel;
        sel.addEventListener('change', () => playerAnimationsApi.set(obj, action, sel.value));
        // ▶ toca o clipe DESTA ação (preview, sem persistir).
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶';
        playBtn.title = `Tocar ${action}`;
        playBtn.style.cssText =
          'flex:0 0 auto;width:26px;padding:2px 0;background:#2a2f3a;color:#fff;border:1px solid #3a3f4a;border-radius:3px;cursor:pointer';
        playBtn.addEventListener('click', () => playerAnimationsApi.preview(obj, sel.value));
        row.append(lbl, sel, playBtn);
        root.append(row);
      }
      // ⏹ para a preview das ações.
      const stop = document.createElement('button');
      stop.textContent = '⏹ Parar preview';
      stop.style.cssText =
        'width:100%;padding:4px;margin:3px 0;background:#2a2f3a;color:#fff;border:1px solid #3a3f4a;border-radius:3px;cursor:pointer';
      stop.addEventListener('click', () => playerAnimationsApi.stop(obj));
      root.append(stop);
    }

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
