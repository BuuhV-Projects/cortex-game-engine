import type { Object3D, Mesh } from 'three';
import { MathUtils } from 'three';
import { setShadows, setMatte, clearMatte, isMatte } from '../scene/SceneAssets.js';
import type { ColliderShape2D } from '../components/Collider2DComponent.js';
import type { ColliderApi, MatteApi, AnimationApi, PlayerAnimationsApi } from './EditorInspector.js';

/**
 * **Modelo declarativo do editor** (ADR-0056). Descreve a hierarquia e o inspector
 * do objeto selecionado como **dado serializável** — sem DOM, sem `three` na saída.
 *
 * É a fonte única que alimenta dois renderizadores: o painel **in-canvas** do
 * engine (projeto standalone) e os painéis **nativos da IDE** (via ponte
 * postMessage, {@link EditorBridge}). A lógica de domínio (collider, animação,
 * matte…) fica nas `*Api` do `attachEditor`; aqui só descrevemos o que mostrar e
 * registramos um **handler** por campo pra aplicar a edição.
 */

/** Campo de vetor 3 (posição/rotação/escala). Renderiza um cabeçalho + X/Y/Z. */
export interface Vec3Field {
  kind: 'vec3';
  id: string;
  label: string;
  value: [number, number, number];
  step?: number;
}
/** Campo numérico simples. */
export interface NumberField {
  kind: 'number';
  id: string;
  label: string;
  value: number;
  step?: number;
}
/** Checkbox booleano. */
export interface CheckboxField {
  kind: 'checkbox';
  id: string;
  label: string;
  value: boolean;
}
/** Opção de um `select`. */
export interface SelectOption {
  value: string;
  label: string;
}
/** Dropdown de opções. */
export interface SelectField {
  kind: 'select';
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
}
/** Seletor de cor (`#rrggbb`). */
export interface ColorField {
  kind: 'color';
  id: string;
  label: string;
  value: string;
}
/** Botão de ação (dispara um handler sem valor). */
export interface ButtonField {
  kind: 'button';
  id: string;
  label: string;
  variant?: 'normal' | 'primary' | 'danger';
}
/** Texto informativo (sem interação). */
export interface NoteField {
  kind: 'note';
  id: string;
  text: string;
  tone?: 'muted' | 'info';
}

/** União de todos os tipos de campo do inspector. */
export type InspectorField =
  | Vec3Field
  | NumberField
  | CheckboxField
  | SelectField
  | ColorField
  | ButtonField
  | NoteField;

/** Seção do inspector (um grupo de campos com título opcional). */
export interface InspectorSection {
  title?: string;
  fields: InspectorField[];
}

/** Modelo completo do inspector do objeto selecionado. */
export interface InspectorModel {
  /** Título (nome do objeto, ou tipo). Vazio quando nada selecionado. */
  title: string;
  /** `true` quando não há seleção (a UI mostra "nada selecionado"). */
  empty: boolean;
  sections: InspectorSection[];
}

/** Item da hierarquia (um filho direto de um `editRoot`). */
export interface OutlinerItem {
  id: string;
  label: string;
  /** Tipo do `Object3D` (Mesh, Group, DirectionalLight…). */
  type: string;
  selected: boolean;
}

/** Modelo da hierarquia (outliner). */
export interface OutlinerModel {
  items: OutlinerItem[];
}

/** Valor que um handler de campo recebe (depende do `kind`). */
export type FieldValue = number | boolean | string | [number, number, number];

/** Resultado opcional de um handler: `rebuild` força re-descrever o inspector. */
export interface HandlerResult {
  rebuild?: boolean;
}

/** Registro `fieldId` → handler (aplica a edição na cena/apis). */
export type HandlerMap = Map<string, (value: FieldValue) => HandlerResult | void>;

/** Resultado de {@link describeInspector}: o modelo + os handlers por campo. */
export interface DescribedInspector {
  model: InspectorModel;
  handlers: HandlerMap;
}

/** Apis de autoria que o inspector usa (implementadas pelo `attachEditor`). */
export interface InspectorContext {
  colliderApi?: ColliderApi;
  matteApi?: MatteApi;
  animationApi?: AnimationApi;
  playerAnimationsApi?: PlayerAnimationsApi;
}

/**
 * Atribui **ids estáveis** a `Object3D` (a borda do iframe só troca strings).
 * O id é por identidade do objeto (WeakMap), não pelo nome (que pode repetir).
 */
export interface ObjectRegistry {
  /** Id estável do objeto (cria na primeira vez). */
  idOf(obj: Object3D): string;
  /** Resolve um id de volta pro objeto (ou `undefined`). */
  get(id: string): Object3D | undefined;
}

/** Cria um {@link ObjectRegistry} vazio. */
export function createObjectRegistry(): ObjectRegistry {
  const ids = new WeakMap<Object3D, string>();
  const forward = new Map<string, Object3D>();
  let seq = 0;
  return {
    idOf(obj) {
      let id = ids.get(obj);
      if (!id) {
        id = `o${(++seq).toString(36)}`;
        ids.set(obj, id);
      }
      forward.set(id, obj);
      return id;
    },
    get: (id) => forward.get(id),
  };
}

function isInternal(obj: Object3D): boolean {
  return obj.userData?.['editorInternal'] === true;
}

function firstMesh(obj: Object3D): Mesh | null {
  let found: Mesh | null = null;
  obj.traverse((child) => {
    if (!found && (child as Mesh).isMesh) found = child as Mesh;
  });
  return found;
}

interface LightLike {
  isLight?: boolean;
  intensity?: number;
  color?: { getHexString(): string; set(hex: number): void };
  shadow?: { intensity?: number };
}

/**
 * Descreve a **hierarquia**: filhos diretos dos `editRoots` (exceto internos do
 * editor), com o item selecionado marcado.
 */
export function describeOutliner(
  editRoots: Object3D[],
  registry: ObjectRegistry,
  current: Object3D | null,
): OutlinerModel {
  const items: OutlinerItem[] = [];
  for (const root of editRoots) {
    for (const child of root.children) {
      if (isInternal(child)) continue;
      items.push({
        id: registry.idOf(child),
        label: child.name || `(${child.type})`,
        type: child.type,
        selected: child === current,
      });
    }
  }
  return { items };
}

/**
 * Descreve o **inspector** do objeto selecionado como modelo + handlers. Espelha
 * o que o inspector mostra hoje (transform, sombra, matte, animação, ações do
 * player, collider, luz). Cada campo registra seu handler em `handlers`.
 */
export function describeInspector(
  obj: Object3D | null,
  ctx: InspectorContext,
  registry: ObjectRegistry,
): DescribedInspector {
  const handlers: HandlerMap = new Map();
  if (!obj) {
    return { model: { title: '', empty: true, sections: [] }, handlers };
  }

  const id = registry.idOf(obj);
  const fid = (suffix: string): string => `${id}:${suffix}`;
  const sections: InspectorSection[] = [];

  // ── Transform ───────────────────────────────────────────────────────────────
  const transform: InspectorField[] = [
    { kind: 'vec3', id: fid('pos'), label: 'Posição', value: [obj.position.x, obj.position.y, obj.position.z] },
    {
      kind: 'vec3',
      id: fid('rot'),
      label: 'Rotação (°)',
      value: [
        MathUtils.radToDeg(obj.rotation.x),
        MathUtils.radToDeg(obj.rotation.y),
        MathUtils.radToDeg(obj.rotation.z),
      ],
    },
    { kind: 'vec3', id: fid('scl'), label: 'Escala', value: [obj.scale.x, obj.scale.y, obj.scale.z] },
  ];
  handlers.set(fid('pos'), (v) => {
    const [x, y, z] = v as [number, number, number];
    obj.position.set(x, y, z);
  });
  handlers.set(fid('rot'), (v) => {
    const [x, y, z] = v as [number, number, number];
    obj.rotation.set(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z));
  });
  handlers.set(fid('scl'), (v) => {
    const [x, y, z] = v as [number, number, number];
    obj.scale.set(x, y, z);
  });
  sections.push({ fields: transform });

  // ── Sombra ──────────────────────────────────────────────────────────────────
  const mesh = firstMesh(obj);
  sections.push({
    title: 'Sombra',
    fields: [
      { kind: 'checkbox', id: fid('cast'), label: 'Projeta sombra', value: mesh?.castShadow ?? obj.castShadow },
      { kind: 'checkbox', id: fid('recv'), label: 'Recebe sombra', value: mesh?.receiveShadow ?? obj.receiveShadow },
    ],
  });
  handlers.set(fid('cast'), (v) => setShadows(obj, { castShadow: v as boolean }));
  handlers.set(fid('recv'), (v) => setShadows(obj, { receiveShadow: v as boolean }));

  // ── Material (fosco/matte) ────────────────────────────────────────────────────
  sections.push({
    title: 'Material',
    fields: [
      {
        kind: 'checkbox',
        id: fid('matte'),
        label: 'Fosco (matte)',
        value: ctx.matteApi ? ctx.matteApi.get(obj) : isMatte(obj),
      },
    ],
  });
  handlers.set(fid('matte'), (v) => {
    const on = v as boolean;
    if (ctx.matteApi) ctx.matteApi.set(obj, on);
    else if (on) setMatte(obj);
    else clearMatte(obj);
  });

  // ── Animação (modelos .glb com clipes) ────────────────────────────────────────
  const animState = ctx.animationApi?.get(obj) ?? null;
  if (ctx.animationApi && animState && animState.clips.length > 0) {
    const api = ctx.animationApi;
    const fields: InspectorField[] = [
      {
        kind: 'select',
        id: fid('animClip'),
        label: 'Clipe',
        value: animState.current ?? animState.clips[0]!,
        options: animState.clips.map((c) => ({ value: c, label: c })),
      },
      { kind: 'button', id: fid('animPlay'), label: '▶ Tocar' },
      { kind: 'button', id: fid('animStop'), label: '⏹ Parar' },
      { kind: 'checkbox', id: fid('animLoop'), label: 'Loop', value: animState.loop },
      { kind: 'number', id: fid('animSpeed'), label: 'Velocidade', value: animState.speed, step: 0.1 },
    ];
    // Trocar o clipe já TOCA (igual ao inspector atual); o botão Play re-toca o atual.
    handlers.set(fid('animClip'), (v) => api.play(obj, v as string));
    handlers.set(fid('animPlay'), () => {
      const s = api.get(obj);
      const clip = s?.current ?? s?.clips[0];
      if (clip) api.play(obj, clip);
    });
    handlers.set(fid('animStop'), () => api.stop(obj));
    handlers.set(fid('animLoop'), (v) => api.setLoop(obj, v as boolean));
    handlers.set(fid('animSpeed'), (v) => api.setSpeed(obj, v as number));
    sections.push({ title: 'Animação', fields });
  }

  // ── Ações do player (mapa ação→clipe) ─────────────────────────────────────────
  const pa = ctx.playerAnimationsApi?.get(obj) ?? null;
  if (ctx.playerAnimationsApi && pa) {
    const api = ctx.playerAnimationsApi;
    const fields: InspectorField[] = [
      { kind: 'button', id: fid('paAuto'), label: '🔎 Auto-mapear pelos nomes' },
    ];
    handlers.set(fid('paAuto'), () => {
      api.autoMap(obj);
      return { rebuild: true };
    });
    for (const action of pa.actions) {
      const selId = fid(`pa:${action}`);
      const playId = fid(`paPlay:${action}`);
      fields.push({
        kind: 'select',
        id: selId,
        label: action,
        value: pa.map[action] ?? '',
        options: [{ value: '', label: '—' }, ...pa.clips.map((c) => ({ value: c, label: c }))],
      });
      fields.push({ kind: 'button', id: playId, label: `▶ ${action}` });
      handlers.set(selId, (v) => api.set(obj, action, v as string));
      handlers.set(playId, () => {
        const cur = api.get(obj);
        const clip = cur?.map[action];
        if (clip) api.preview(obj, clip);
      });
    }
    fields.push({ kind: 'button', id: fid('paStop'), label: '⏹ Parar preview' });
    handlers.set(fid('paStop'), () => api.stop(obj));
    sections.push({ title: 'Ações do player', fields });
  }

  // ── Collider (autorável) ──────────────────────────────────────────────────────
  if (ctx.colliderApi) {
    const api = ctx.colliderApi;
    const fields: InspectorField[] = [];
    const cs = obj.name ? api.get(obj) : null;

    if (!obj.name) {
      fields.push({ kind: 'note', id: fid('cldNoName'), text: 'Dê um nome ao objeto pra poder adicionar um collider.', tone: 'muted' });
    } else if (cs === null) {
      fields.push(
        { kind: 'button', id: fid('cldAdd'), label: '+ Adicionar collider' },
        { kind: 'button', id: fid('cldAutoHf'), label: '⤓ Auto-traçar chão (heightfield)' },
        { kind: 'button', id: fid('cldDrawHf'), label: '✎ Desenhar chão (heightfield)' },
      );
      handlers.set(fid('cldAdd'), () => {
        api.add(obj);
        return { rebuild: true };
      });
      handlers.set(fid('cldAutoHf'), () => {
        api.autoHeightfield(obj);
        return { rebuild: true };
      });
      handlers.set(fid('cldDrawHf'), () => api.startHeightfield(obj));
    } else if (cs.locked) {
      const kind = cs.oneWay ? 'one-way' : cs.solid ? 'sólido' : 'não-sólido';
      const shp =
        cs.shape === 'circle' ? 'círculo'
        : cs.shape === 'capsule' ? 'cápsula'
        : cs.shape === 'heightfield' ? 'perfil'
        : 'caixa';
      fields.push(
        { kind: 'note', id: fid('cldInfo'), text: `${shp} ${cs.width.toFixed(2)}×${cs.height.toFixed(2)} · ${kind}`, tone: 'info' },
        { kind: 'note', id: fid('cldLocked'), text: 'definido no código', tone: 'muted' },
      );
    } else if (cs.shape === 'heightfield') {
      fields.push(
        { kind: 'note', id: fid('hfInfo'), text: `Perfil de chão — ${cs.pointCount} ponto(s).`, tone: 'info' },
        { kind: 'note', id: fid('hfHint'), text: 'No modo desenho: clique adiciona · arraste um ponto pra mover · Backspace desfaz · Enter finaliza.', tone: 'muted' },
        { kind: 'button', id: fid('hfEdit'), label: '✎ Editar / desenhar pontos' },
        { kind: 'button', id: fid('cldRemove'), label: 'Remover collider', variant: 'danger' },
      );
      handlers.set(fid('hfEdit'), () => api.startHeightfield(obj));
      handlers.set(fid('cldRemove'), () => {
        api.remove(obj);
        return { rebuild: true };
      });
    } else {
      fields.push({
        kind: 'select',
        id: fid('cldShape'),
        label: 'Forma',
        value: cs.shape,
        options: [
          { value: 'box', label: 'Caixa' },
          { value: 'circle', label: 'Círculo' },
          { value: 'capsule', label: 'Cápsula' },
        ],
      });
      handlers.set(fid('cldShape'), (v) => {
        api.update(obj, { shape: v as ColliderShape2D });
        return { rebuild: true }; // labels de tamanho mudam conforme a forma
      });

      fields.push({
        kind: 'number',
        id: fid('cldW'),
        label: cs.shape === 'box' ? 'Largura' : 'Diâmetro',
        value: cs.width,
        step: 0.1,
      });
      handlers.set(fid('cldW'), (v) => api.update(obj, { width: Math.max(0.01, v as number) }));

      if (cs.shape !== 'circle') {
        fields.push({ kind: 'number', id: fid('cldH'), label: 'Altura', value: cs.height, step: 0.1 });
        handlers.set(fid('cldH'), (v) => api.update(obj, { height: Math.max(0.01, v as number) }));
      }

      fields.push(
        { kind: 'number', id: fid('cldOx'), label: 'Offset X', value: cs.offsetX, step: 0.1 },
        { kind: 'number', id: fid('cldOy'), label: 'Offset Y', value: cs.offsetY, step: 0.1 },
        { kind: 'checkbox', id: fid('cldSolid'), label: 'Sólido', value: cs.solid },
        { kind: 'checkbox', id: fid('cldOneWay'), label: 'One-way', value: cs.oneWay },
        { kind: 'button', id: fid('cldRemove'), label: 'Remover collider', variant: 'danger' },
      );
      handlers.set(fid('cldOx'), (v) => api.update(obj, { offsetX: v as number }));
      handlers.set(fid('cldOy'), (v) => api.update(obj, { offsetY: v as number }));
      handlers.set(fid('cldSolid'), (v) => api.update(obj, { solid: v as boolean }));
      handlers.set(fid('cldOneWay'), (v) => api.update(obj, { oneWay: v as boolean }));
      handlers.set(fid('cldRemove'), () => {
        api.remove(obj);
        return { rebuild: true };
      });
    }
    sections.push({ title: 'Collider', fields });
  }

  // ── Luz ───────────────────────────────────────────────────────────────────────
  const light = obj as unknown as LightLike;
  if (light.isLight) {
    const fields: InspectorField[] = [];
    if (typeof light.intensity === 'number') {
      fields.push({ kind: 'number', id: fid('lightInt'), label: 'Intens.', value: light.intensity, step: 0.1 });
      handlers.set(fid('lightInt'), (v) => {
        light.intensity = v as number;
      });
    }
    if (light.color) {
      fields.push({ kind: 'color', id: fid('lightColor'), label: 'Cor', value: `#${light.color.getHexString()}` });
      handlers.set(fid('lightColor'), (v) => {
        const hex = parseInt((v as string).slice(1), 16);
        if (!Number.isNaN(hex)) light.color?.set(hex);
      });
    }
    if (light.shadow && typeof light.shadow.intensity === 'number') {
      fields.push({ kind: 'number', id: fid('lightShadow'), label: 'Sombra', value: light.shadow.intensity, step: 0.1 });
      handlers.set(fid('lightShadow'), (v) => {
        if (light.shadow) light.shadow.intensity = Math.max(0, Math.min(1, v as number));
      });
    }
    if (fields.length) sections.push({ title: 'Luz', fields });
  }

  return { model: { title: obj.name || `(${obj.type})`, empty: false, sections }, handlers };
}
