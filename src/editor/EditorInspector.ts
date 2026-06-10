import type { Object3D } from 'three';
import type { ColliderShape2D } from '../components/Collider2DComponent.js';
import type { MaterialConfig } from '../scene/Materials.js';
import type { EditorSelection } from './EditorSelection.js';
import {
  describeInspector,
  createObjectRegistry,
  type ObjectRegistry,
  type InspectorContext,
  type HandlerMap,
} from './EditorModel.js';
import { createInspectorView } from './EditorModelDom.js';

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

/**
 * Ponte de autoria do **material/shader** do objeto (ADR-0058): o inspector
 * escolhe o preset (standard/unlit/toon) e os parâmetros por aqui. Implementada
 * pelo `attachEditor` contra `applyMaterial` + a overlay (`data.material[nome]`),
 * pra o material ficar autorado (sobrevive ao reload). `get` devolve a config
 * autorada, ou `null` (= standard / não autorado).
 */
export interface MaterialApi {
  get(obj: Object3D): MaterialConfig | null;
  set(obj: Object3D, config: MaterialConfig): void;
}

/** Estado do terreno selecionado (pincel de esculpir). `null` se não é terreno. */
export interface TerrainEditState {
  /** Esculpindo agora (pincel ativo no terreno)? */
  sculpting: boolean;
  /** Raio do pincel (unidades de mundo). */
  radius: number;
  /** Força (quanto sobe/abaixa por pincelada). */
  strength: number;
}

/**
 * Ponte de autoria do **terreno**: o inspector liga/desliga o pincel (raise/lower)
 * e ajusta tamanho/força. Implementada pelo `attachEditor` contra o {@link Terrain}
 * (em `mesh.userData.cortexTerrain`) + a overlay (`data.terrain[nome]` = heightmap).
 * `get` devolve `null` se o objeto não é um terreno.
 */
export interface TerrainApi {
  get(obj: Object3D): TerrainEditState | null;
  /** Entra/sai do modo esculpir (pincel). */
  startSculpt(obj: Object3D): void;
  stopSculpt(): void;
  /** Ajusta o pincel (raio + força). */
  setBrush(radius: number, strength: number): void;
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
  /** Opcional: autoria/persistência do material/shader por objeto. Ver {@link MaterialApi}. */
  materialApi?: MaterialApi;
  /** Opcional: pincel de esculpir terreno. Ver {@link TerrainApi}. */
  terrainApi?: TerrainApi;
  /** Opcional: controle/persistência de animação (escolher clipe, play/stop). Ver {@link AnimationApi}. */
  animationApi?: AnimationApi;
  /** Opcional: mapa ação→clipe do player (idle/run/jump/…). Ver {@link PlayerAnimationsApi}. */
  playerAnimationsApi?: PlayerAnimationsApi;
  /** Opcional: write-back de transform pro ECS (ver {@link InspectorContext.writeBack}). */
  writeBack?: (obj: Object3D) => void;
  /**
   * Opcional: registro de ids de objeto compartilhado (ADR-0056). Passe a mesma
   * instância usada pela ponte/outliner pra os ids baterem entre renderizadores.
   * Default: um registro novo (suficiente pro caso standalone).
   */
  registry?: ObjectRegistry;
}

/**
 * Cria o painel de **propriedades** (inspector) do modo editor. Renderiza o
 * {@link describeInspector | modelo declarativo} (ADR-0056) do objeto selecionado,
 * reagindo a `selection.onChange` (reconstrói) e `selection.onTransform` (atualiza
 * valores ao vivo enquanto o gizmo arrasta).
 *
 * Campos: transform (posição/rotação°/escala), sombra, material (matte), animação,
 * ações do player, collider e luz — todos descritos em `EditorModel`. A mesma
 * descrição alimenta os painéis nativos da IDE via a ponte postMessage.
 *
 * Opcional/conveniência (acopla ao DOM) — comece escondido e use `setVisible`.
 */
export function createEditorInspector(options: EditorInspectorOptions): EditorInspector {
  const {
    selection,
    parent = document.body,
    colliderApi,
    matteApi,
    materialApi,
    terrainApi,
    animationApi,
    playerAnimationsApi,
    writeBack,
    registry = createObjectRegistry(),
  } = options;
  const ctx: InspectorContext = { colliderApi, matteApi, materialApi, terrainApi, animationApi, playerAnimationsApi, writeBack };

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

  let handlers: HandlerMap = new Map();
  const view = createInspectorView({
    onInput: (id, value) => {
      const res = handlers.get(id)?.(value);
      if (res?.rebuild) rebuild();
    },
    onButton: (id) => {
      // Botões não têm valor; o handler ignora o argumento.
      const res = handlers.get(id)?.(0);
      if (res?.rebuild) rebuild();
    },
  });
  root.append(view.root);

  function rebuild(): void {
    const d = describeInspector(selection.current, ctx, registry);
    handlers = d.handlers;
    view.render(d.model);
  }

  function refresh(): void {
    const d = describeInspector(selection.current, ctx, registry);
    handlers = d.handlers;
    if (view.sameStructure(d.model)) view.refreshValues(d.model);
    else view.render(d.model);
  }

  selection.onChange(() => rebuild());
  selection.onTransform(() => refresh());
  rebuild();

  return {
    root,
    setVisible(v: boolean): void {
      root.style.display = v ? 'block' : 'none';
    },
    refresh,
  };
}
