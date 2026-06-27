import type { Object3D, Mesh } from 'three';
import { MathUtils } from 'three';
import { setShadows, setMatte, clearMatte, isMatte } from '../scene/SceneAssets.js';
import type { ColliderShape2D } from '../components/Collider2DComponent.js';
import type { MaterialConfig } from '../scene/Materials.js';
import type { ColliderApi, PhysicsApi, MatteApi, MaterialApi, MeshApi, RoadApi, TerrainApi, AnimationApi, PlayerAnimationsApi } from './EditorInspector.js';
import type { BodyType } from '../scene/SceneBuilder.js';
import type { RapierBodyType } from '../components/RapierBodyComponent.js';

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
/**
 * Seletor de **arquivo local** (importação de asset). Cada renderizador abre o
 * file picker NATIVO no seu próprio frame (o clique do usuário acontece lá — um
 * picker aberto via postMessage seria bloqueado por falta de user activation) e
 * entrega ao handler uma string JSON `{ name, dataUrl }` com o conteúdo lido.
 */
export interface FileField {
  kind: 'file';
  id: string;
  label: string;
  /** Filtro do seletor (atributo `accept`), ex. `image/*`. */
  accept?: string;
}

/** União de todos os tipos de campo do inspector. */
export type InspectorField =
  | Vec3Field
  | NumberField
  | CheckboxField
  | SelectField
  | ColorField
  | ButtonField
  | NoteField
  | FileField;

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

/** Item da hierarquia (um nó da árvore de cena). */
export interface OutlinerItem {
  id: string;
  label: string;
  /** Tipo do `Object3D` (Mesh, Group, DirectionalLight…). */
  type: string;
  selected: boolean;
  /** Filhos no grafo de cena (aninhamento real — ex.: sub-malhas de um .glb). */
  children: OutlinerItem[];
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
  physicsApi?: PhysicsApi;
  matteApi?: MatteApi;
  materialApi?: MaterialApi;
  meshApi?: MeshApi;
  roadApi?: RoadApi;
  terrainApi?: TerrainApi;
  animationApi?: AnimationApi;
  playerAnimationsApi?: PlayerAnimationsApi;
  /**
   * Propaga uma edição de transform (posição/rotação) pro ECS — pra objetos com
   * entidade sincronizada, escrever só no `Object3D` seria sobrescrito pelo
   * `Object3DSyncSystem`. Implementado pelo `attachEditor` (mesmo write-back do gizmo).
   */
  writeBack?: (obj: Object3D) => void;
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
function describeNode(obj: Object3D, registry: ObjectRegistry, current: Object3D | null): OutlinerItem {
  const children: OutlinerItem[] = [];
  for (const c of obj.children) {
    if (isInternal(c)) continue;
    children.push(describeNode(c, registry, current));
  }
  return {
    id: registry.idOf(obj),
    label: obj.name || `(${obj.type})`,
    type: obj.type,
    selected: obj === current,
    children,
  };
}

export function describeOutliner(
  editRoots: Object3D[],
  registry: ObjectRegistry,
  current: Object3D | null,
): OutlinerModel {
  const items: OutlinerItem[] = [];
  for (const root of editRoots) {
    for (const child of root.children) {
      if (isInternal(child)) continue;
      items.push(describeNode(child, registry, current));
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
    ctx.writeBack?.(obj);
  });
  handlers.set(fid('rot'), (v) => {
    const [x, y, z] = v as [number, number, number];
    obj.rotation.set(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z));
    ctx.writeBack?.(obj);
  });
  handlers.set(fid('scl'), (v) => {
    const [x, y, z] = v as [number, number, number];
    obj.scale.set(x, y, z);
    ctx.writeBack?.(obj);
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

  // ── Shader / material por objeto (ADR-0058) ──────────────────────────────────
  // Só pra objetos com malha (luzes/grupos vazios não têm material). Preset +
  // parâmetros; o materialApi aplica ao vivo e persiste no overlay.
  if (ctx.materialApi && mesh) {
    const api = ctx.materialApi;
    const cur = api.get(obj);
    const type = cur?.type ?? 'standard';
    const fields: InspectorField[] = [
      {
        kind: 'select',
        id: fid('shader'),
        label: 'Shader',
        value: type,
        options: [
          { value: 'standard', label: 'Padrão (PBR)' },
          { value: 'unlit', label: 'Unlit (fullbright)' },
          { value: 'toon', label: 'Toon (cel)' },
        ],
      },
    ];
    // Trocar o preset cria uma config nova com defaults e re-descreve (mostra os params).
    // SEM cor por padrão: o material é re-sombreado EM CIMA do original, preservando
    // as cores reais (vertex colors / multi-material). Evita achatar tudo numa cor só.
    handlers.set(fid('shader'), (v) => {
      const t = v as string;
      const cfg: MaterialConfig =
        t === 'unlit' ? { type: 'unlit' }
        : t === 'toon' ? { type: 'toon', gradientSteps: 3, outline: 0 }
        : { type: 'standard' };
      api.set(obj, cfg);
      return { rebuild: true };
    });

    if (type === 'unlit') {
      // Unlit porta o shader Unity (textura × cor): mantém o tint opcional, mas o
      // default preserva as cores do original (cor não-setada = não achata).
      const c = cur as Extract<MaterialConfig, { type: 'unlit' }>;
      fields.push(
        { kind: 'checkbox', id: fid('matTwoSided'), label: 'Dois lados', value: c.cull === 'none' },
        { kind: 'checkbox', id: fid('matTransp'), label: 'Transparente', value: !!c.transparent },
      );
      handlers.set(fid('matTwoSided'), (v) => api.set(obj, { ...c, cull: (v as boolean) ? 'none' : 'back' }));
      handlers.set(fid('matTransp'), (v) => api.set(obj, { ...c, transparent: v as boolean }));
    } else if (type === 'toon') {
      // Toon re-sombreia em cima do original (sem trocar cor, a pedido) — preserva
      // as cores reais do modelo. Só bandas + contorno.
      const c = cur as Extract<MaterialConfig, { type: 'toon' }>;
      fields.push(
        { kind: 'number', id: fid('matSteps'), label: 'Bandas', value: c.gradientSteps ?? 3, step: 1 },
        { kind: 'number', id: fid('matOutline'), label: 'Contorno', value: c.outline ?? 0, step: 0.01 },
      );
      handlers.set(fid('matSteps'), (v) => {
        const n = Math.round(Number(v));
        api.set(obj, { ...c, gradientSteps: Number.isFinite(n) ? Math.max(2, Math.min(8, n)) : 3 });
      });
      handlers.set(fid('matOutline'), (v) => {
        const n = Number(v);
        api.set(obj, { ...c, outline: Number.isFinite(n) ? Math.max(0, n) : 0 });
      });
    }
    sections.push({ title: 'Shader', fields });
  }

  // ── Forma (blockout — ProBuilder, ADR-0071) ──────────────────────────────────
  // Nó `mesh`: edita os parâmetros da receita (regenera ao vivo) ou reseta a
  // edição de elementos. Some quando o objeto não é um mesh editável.
  const meshState = ctx.meshApi?.get(obj) ?? null;
  if (ctx.meshApi && meshState) {
    const api = ctx.meshApi;
    const fields: InspectorField[] = [];
    if (meshState.edited) {
      // Geometria editada por vértice/face: a receita ficou "detached".
      fields.push({ kind: 'note', id: fid('shapeEdited'), text: 'Malha editada por elemento.', tone: 'info' });
      fields.push({ kind: 'button', id: fid('shapeReset'), label: '↺ Resetar forma', variant: 'danger' });
      handlers.set(fid('shapeReset'), () => {
        api.resetGeometry(obj);
        return { rebuild: true };
      });
    } else if (meshState.kind) {
      for (const p of meshState.params) {
        const pid = fid(`shapeP_${p.key}`);
        // Medidas em metros (engine trabalha em metros); contagens (lados/degraus) não.
        const label = p.int ? p.label : `${p.label} (m)`;
        fields.push({ kind: 'number', id: pid, label, value: p.value, step: p.step ?? (p.int ? 1 : 0.25) });
        handlers.set(pid, (v) => {
          let n = Number(v);
          if (!Number.isFinite(n)) return;
          if (p.int) n = Math.round(n);
          if (p.min !== undefined) n = Math.max(p.min, n);
          if (p.max !== undefined) n = Math.min(p.max, n);
          api.setParam(obj, p.key, n);
        });
      }
    }
    // Edição de elementos (Fase 2): botões de modo + extrudar. Só quando o
    // MeshEditSystem está ligado (api.editMode presente).
    if (api.editMode && api.setEditMode) {
      const cur = api.editMode(obj);
      const modeBtn = (mode: 'vertex' | 'edge' | 'face', label: string): void => {
        const bid = fid(`meshMode_${mode}`);
        fields.push({ kind: 'button', id: bid, label: cur === mode ? `● ${label}` : label, variant: cur === mode ? 'primary' : 'normal' });
        handlers.set(bid, () => {
          api.setEditMode!(obj, cur === mode ? 'object' : mode);
          return { rebuild: true };
        });
      };
      fields.push({ kind: 'note', id: fid('meshEditNote'), text: 'Editar elementos:', tone: 'muted' });
      modeBtn('vertex', 'Vértice');
      modeBtn('edge', 'Aresta');
      modeBtn('face', 'Face');
      if (cur === 'face' && api.extrudeSelected) {
        fields.push({ kind: 'button', id: fid('meshExtrude'), label: '⬆ Extrudar face', variant: 'normal' });
        handlers.set(fid('meshExtrude'), () => {
          api.extrudeSelected!();
          return { rebuild: true };
        });
      }
    }

    if (fields.length) sections.push({ title: 'Forma', fields });
  }

  // ── Estrada (superfície + largura — ADR-0072) ────────────────────────────────
  const roadState = ctx.roadApi?.get(obj) ?? null;
  if (ctx.roadApi && roadState) {
    const api = ctx.roadApi;
    const surfaces = ['asphalt', 'concrete', 'dirt', 'brick', 'cobblestone'];
    const labels: Record<string, string> = {
      asphalt: 'Asfalto', concrete: 'Concreto', dirt: 'Terra', brick: 'Tijolo', cobblestone: 'Paralelepípedo', custom: 'Custom',
    };
    const opts = surfaces.map((s) => ({ value: s, label: labels[s]! }));
    if (roadState.surface === 'custom') opts.unshift({ value: 'custom', label: 'Custom' });
    const fields: InspectorField[] = [
      { kind: 'select', id: fid('roadSurface'), label: 'Superfície', value: roadState.surface, options: opts },
      { kind: 'number', id: fid('roadWidth'), label: 'Largura (m)', value: roadState.width, step: 0.5 },
      // Fase 2: quem se adapta a quem (pista↔terreno). Ver ADR-0072.
      { kind: 'select', id: fid('roadTerrain'), label: 'Terreno', value: roadState.terrainMode, options: [
        { value: 'conform', label: 'Pista acompanha relevo' },
        { value: 'cutfill', label: 'Terreno se adapta (corte/aterro)' },
      ] },
    ];
    // Talude só faz sentido (e só é editável) no modo cut & fill.
    if (roadState.terrainMode === 'cutfill') {
      fields.push({ kind: 'number', id: fid('roadTalude'), label: 'Talude (m)', value: roadState.taludeWidth, step: 0.5 });
    }
    handlers.set(fid('roadSurface'), (v) => {
      api.setSurface(obj, String(v));
    });
    handlers.set(fid('roadWidth'), (v) => {
      const n = Number(v);
      if (Number.isFinite(n)) api.setWidth(obj, n);
    });
    handlers.set(fid('roadTerrain'), (v) => {
      api.setTerrainMode(obj, v === 'cutfill' ? 'cutfill' : 'conform');
    });
    handlers.set(fid('roadTalude'), (v) => {
      const n = Number(v);
      if (Number.isFinite(n)) api.setTalude(obj, n);
    });
    // Modal com preview de TODAS as texturas de assets/roads/ (ADR-0072).
    if (api.pickSurface) {
      fields.push({ kind: 'button', id: fid('roadPick'), label: '🖼 Escolher textura…' });
      handlers.set(fid('roadPick'), () => {
        api.pickSurface!(obj);
      });
    }
    sections.push({ title: 'Estrada', fields });
  }

  // ── Terreno (pincel: esculpir altura OU texturizar/pintar) ────────────────────
  const terrainState = ctx.terrainApi?.get(obj) ?? null;
  if (ctx.terrainApi && terrainState) {
    const api = ctx.terrainApi;
    const s = terrainState;
    const paint = s.mode === 'paint';
    const verb = paint ? 'Texturizar' : 'Esculpir';
    const fields: InspectorField[] = [
      { kind: 'button', id: fid('terSculpt'), label: s.sculpting ? '■ Parar pincel' : `${paint ? '🖌' : '⛰'} ${verb}`, variant: s.sculpting ? 'danger' : 'primary' },
      {
        kind: 'select',
        id: fid('terMode'),
        label: 'Modo',
        value: s.mode,
        options: [
          { value: 'sculpt', label: 'Esculpir (altura)' },
          { value: 'paint', label: 'Texturizar (pintar)' },
        ],
      },
      { kind: 'number', id: fid('terRadius'), label: 'Tamanho do pincel', value: s.radius, step: 1 },
      { kind: 'number', id: fid('terStrength'), label: paint ? 'Opacidade' : 'Força', value: s.strength, step: 0.1 },
    ];
    handlers.set(fid('terSculpt'), () => {
      if (s.sculpting) api.stopSculpt();
      else api.startSculpt(obj);
      return { rebuild: true };
    });
    handlers.set(fid('terMode'), (v) => {
      api.setMode(v as 'sculpt' | 'paint');
      return { rebuild: true }; // mostra/esconde os campos de textura
    });
    handlers.set(fid('terRadius'), (v) => {
      const r = Math.max(0.5, Number(v) || s.radius);
      api.setBrush(r, s.strength);
    });
    handlers.set(fid('terStrength'), (v) => {
      const st = Number(v);
      api.setBrush(s.radius, Number.isFinite(st) ? st : s.strength);
    });

    if (paint) {
      // Textura ativa: modal com PREVIEW (padrão — ADR-0073) + importação de arquivo
      // local (copiado pra assets/textures/ e entra na lista). Mostra a textura atual.
      const baseName = (p: string): string => p.split('/').pop() ?? p;
      if (api.pickTexture) {
        fields.push({ kind: 'note', id: fid('terTexCur'), text: s.texture ? `Textura: ${baseName(s.texture)}` : 'Nenhuma textura', tone: 'muted' });
        fields.push({ kind: 'button', id: fid('terPick'), label: '🖼 Escolher textura…' });
        handlers.set(fid('terPick'), () => {
          api.pickTexture!(obj);
        });
      } else {
        // Fallback (sem modal injetado): dropdown simples.
        fields.push({
          kind: 'select', id: fid('terTexture'), label: 'Textura', value: s.texture ?? '',
          options: [{ value: '', label: '— escolha —' }, ...s.textures.map((u) => ({ value: u, label: baseName(u) }))],
        });
        handlers.set(fid('terTexture'), (v) => {
          api.setTexture(obj, v as string);
          return { rebuild: true };
        });
      }
      fields.push({ kind: 'file', id: fid('terImport'), label: '⬆ Importar textura…', accept: 'image/*' });
      handlers.set(fid('terImport'), (v) => {
        try {
          const f = JSON.parse(v as string) as { name?: string; dataUrl?: string };
          if (f.name && f.dataUrl) api.importTexture(obj, f.name, f.dataUrl);
        } catch {
          /* valor inválido do seletor — ignora */
        }
        return { rebuild: true };
      });
      if (s.texture) {
        fields.push({ kind: 'number', id: fid('terRepeat'), label: 'Repetição', value: s.repeat, step: 1 });
        handlers.set(fid('terRepeat'), (v) => {
          const r = Number(v);
          if (Number.isFinite(r) && r > 0) api.setRepeat(obj, r);
        });
      }
      fields.push({ kind: 'note', id: fid('terHint'), text: 'Pincel ligado: CLIQUE/ARRASTE pinta a textura · SHIFT apaga. Até 4 texturas por terreno.', tone: 'muted' });
    } else {
      fields.push({ kind: 'note', id: fid('terHint'), text: 'Pincel ligado: CLIQUE/ARRASTE sobe · segure SHIFT pra abaixar.', tone: 'muted' });
    }
    sections.push({ title: 'Terreno', fields });
  }

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

  // ── Física: tipo de corpo (Nenhum/Estático/Character), estilo UPBGE ───────────
  // O "Tipo" é a fonte autoritativa e fica SEMPRE editável — inclusive pra
  // remover/trocar física cravada no código/level.json (ADR-0058). Estático reusa
  // a autoria de Collider2D; Character mostra os params da cápsula.
  if (ctx.physicsApi) {
    const papi = ctx.physicsApi;
    const fields: InspectorField[] = [];
    const isSceneNode = obj.userData?.['cortexSceneNode'] === true;
    if (!obj.name) {
      fields.push({ kind: 'note', id: fid('physNoName'), text: 'Dê um nome ao objeto pra definir física.', tone: 'muted' });
    } else if (!isSceneNode) {
      // Objeto criado em CÓDIGO (não é nó da cena): autorar física aqui não persiste
      // (o buildScene só reconcilia nós). Bloqueia pra não enganar o usuário.
      fields.push({
        kind: 'note',
        id: fid('physNotNode'),
        text: 'Criado em código — a física deste objeto não é editável aqui. Pra editar no Inspector, declare-o como nó da cena (collider/player/character/rapierBody no level.json).',
        tone: 'muted',
      });
    } else {
      const ps = papi.get(obj);
      fields.push({
        kind: 'select',
        id: fid('physType'),
        label: 'Tipo de corpo',
        value: ps.type,
        options: [
          { value: 'none', label: 'Nenhum' },
          { value: 'static', label: 'Estático (sólido)' },
          { value: 'character', label: 'Character' },
          { value: 'rigid', label: 'Rígido (Rapier)' },
        ],
      });
      handlers.set(fid('physType'), (v) => {
        papi.setType(obj, v as BodyType);
        return { rebuild: true };
      });

      if (ps.type === 'character') {
        const c = ps.character;
        fields.push(
          { kind: 'number', id: fid('chRadius'), label: 'Raio (cápsula)', value: c.radius, step: 0.05 },
          { kind: 'number', id: fid('chHeight'), label: 'Altura', value: c.height, step: 0.1 },
          { kind: 'number', id: fid('chStep'), label: 'Sobe degrau até', value: c.stepHeight, step: 0.05 },
          { kind: 'number', id: fid('chJump'), label: 'Força do pulo', value: c.jumpForce, step: 0.5 },
          { kind: 'number', id: fid('chFall'), label: 'Queda máxima', value: c.fallSpeedMax, step: 1 },
          { kind: 'number', id: fid('chJumps'), label: 'Pulos máx.', value: c.maxJumps, step: 1 },
          { kind: 'number', id: fid('chGround'), label: 'Piso de segurança (Y)', value: c.groundY, step: 0.1 },
          { kind: 'note', id: fid('chHint'), text: 'Cai pela gravidade e pousa na GEOMETRIA real embaixo (terreno/tiles/plataformas) — coloque ele no alto pra ver cair. "Piso de segurança (Y)" é a rede caso não haja nada embaixo. Pula no espaço (no Play). "Sobe degrau até" = altura máx. de obstáculo que sobe andando.', tone: 'muted' },
        );
        handlers.set(fid('chRadius'), (v) => papi.setCharacter(obj, { radius: Math.max(0.05, Number(v) || c.radius) }));
        handlers.set(fid('chHeight'), (v) => papi.setCharacter(obj, { height: Math.max(0.1, Number(v) || c.height) }));
        handlers.set(fid('chStep'), (v) => papi.setCharacter(obj, { stepHeight: Math.max(0, Number(v) || 0) }));
        handlers.set(fid('chJump'), (v) => papi.setCharacter(obj, { jumpForce: Math.max(0, Number(v) || 0) }));
        handlers.set(fid('chFall'), (v) => papi.setCharacter(obj, { fallSpeedMax: Math.max(0.1, Number(v) || c.fallSpeedMax) }));
        handlers.set(fid('chJumps'), (v) => papi.setCharacter(obj, { maxJumps: Math.max(0, Math.round(Number(v) || 0)) }));
        handlers.set(fid('chGround'), (v) => papi.setCharacter(obj, { groundY: Number(v) || 0 }));
      } else if (ps.type === 'rigid') {
        // Corpo rígido do Rapier: física dinâmica 3D (cai/empilha/empurra).
        fields.push(
          {
            kind: 'select',
            id: fid('rbType'),
            label: 'Corpo',
            value: ps.rapier.bodyType,
            options: [
              { value: 'dynamic', label: 'Dinâmico (cai/empurra)' },
              { value: 'fixed', label: 'Fixo (chão/parede)' },
              { value: 'kinematic', label: 'Cinemático (você move)' },
            ],
          },
          { kind: 'note', id: fid('rbHint'), text: 'Física dinâmica de verdade (Rapier): cai, empilha e empurra. Só simula no Play. A forma do collider é a caixa do objeto (auto).', tone: 'muted' },
        );
        handlers.set(fid('rbType'), (v) => papi.setRapier(obj, { bodyType: v as RapierBodyType }));
      } else if (ps.type === 'static' && ctx.colliderApi) {
        // Estático reusa a autoria de Collider2D (forma/tamanho/offset/sólido). Mesmo
        // se veio do código, é editável: editar grava no overlay (que vence o código).
        describeColliderFields(ctx.colliderApi, obj, fid, fields, handlers, true);
      } else if (ps.type === 'none') {
        fields.push({ kind: 'note', id: fid('physNone'), text: 'Sem física — nada colide com este objeto.', tone: 'muted' });
      }
    }
    sections.push({ title: 'Física', fields });
  } else if (ctx.colliderApi) {
    // Fallback (sem physicsApi): a seção Collider clássica.
    const fields: InspectorField[] = [];
    describeColliderFields(ctx.colliderApi, obj, fid, fields, handlers, false);
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

/**
 * Constrói os campos de **autoria de Collider2D** (forma/tamanho/offset/sólido,
 * heightfield, add/remover) no array `fields` + registra handlers. Usado pela seção
 * **Física** (sub-tipo Estático) e pelo fallback Collider clássico. `allowEditLocked`:
 * quando `true`, um collider definido no código aparece **editável** (a edição grava
 * no overlay, que vence o código) em vez de read-only.
 */
function describeColliderFields(
  api: ColliderApi,
  obj: Object3D,
  fid: (suffix: string) => string,
  fields: InspectorField[],
  handlers: HandlerMap,
  allowEditLocked: boolean,
): void {
  const cs = obj.name ? api.get(obj) : null;

  if (!obj.name) {
    fields.push({ kind: 'note', id: fid('cldNoName'), text: 'Dê um nome ao objeto pra poder adicionar um collider.', tone: 'muted' });
    return;
  }
  if (cs === null) {
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
    } else if (cs.locked && !allowEditLocked) {
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
}
