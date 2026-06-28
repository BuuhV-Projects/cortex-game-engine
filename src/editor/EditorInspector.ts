import type { Object3D } from 'three';
import type { ColliderShape2D } from '../components/Collider2DComponent.js';
import type { MaterialConfig } from '../scene/Materials.js';
import type { BodyType } from '../scene/SceneBuilder.js';
import type { RapierBodyType } from '../components/RapierBodyComponent.js';
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

/** Parâmetros do corpo de Character (cápsula + gravidade + pulo + piso). */
export interface CharacterEditState {
  radius: number;
  height: number;
  gravity: number;
  stepHeight: number;
  jumpForce: number;
  fallSpeedMax: number;
  maxJumps: number;
  /** Piso plano onde aterra (sem raycast). Default = altura onde o objeto está. */
  groundY: number;
}

/** Parâmetros do corpo rígido do Rapier (válidos quando `type === 'rigid'`). */
export interface RapierEditState {
  /** `dynamic` cai/é empurrado; `fixed` imóvel (chão/parede); `kinematic` você move. */
  bodyType: RapierBodyType;
}

/** Estado de física do objeto selecionado (tipo de corpo + params por tipo). */
export interface PhysicsEditState {
  /** Tipo efetivo (override do Inspector vence o código/level.json). */
  type: BodyType;
  /** Params do Character (válidos quando `type === 'character'`; defaults senão). */
  character: CharacterEditState;
  /** Params do corpo Rapier (válidos quando `type === 'rigid'`; defaults senão). */
  rapier: RapierEditState;
}

/**
 * Ponte de autoria do **tipo de corpo físico** (Nenhum/Estático/Character) — o
 * seletor "Tipo" do Inspector, estilo UPBGE. É a fonte autoritativa: marca o
 * objeto e o `attachEditor` aplica AO VIVO (adiciona/remove Collider2D ou
 * CharacterBody + registra os sistemas) e PERSISTE em `overlay.data.physics[nome]`,
 * que o `buildScene` respeita no boot (sobrescrevendo collider cravado no código).
 * Resolve "a física aparece no Inspector e dá pra editar/remover".
 */
export interface PhysicsApi {
  /** Tipo de corpo efetivo + params do Character. Sempre devolve (default `none`). */
  get(obj: Object3D): PhysicsEditState;
  /** Troca o tipo de corpo (aplica ao vivo + persiste). */
  setType(obj: Object3D, type: BodyType): void;
  /** Ajusta params do Character (aplica ao vivo + persiste). */
  setCharacter(obj: Object3D, patch: Partial<CharacterEditState>): void;
  /** Ajusta params do corpo Rapier (aplica ao vivo + persiste). */
  setRapier(obj: Object3D, patch: Partial<RapierEditState>): void;
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

/** Um parâmetro editável da forma de blockout (ADR-0071), já com o valor atual. */
export interface MeshShapeParam {
  key: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  int?: boolean;
}

/** Estado da forma de um nó `mesh` selecionado (`null` se não é mesh editável). */
export interface MeshShapeState {
  /** Tipo da forma (`cube`/`stairs`/…) — `null` se a malha é freeform (sem receita). */
  kind: string | null;
  /** Parâmetros da receita (vazio se freeform). */
  params: MeshShapeParam[];
  /** A geometria foi editada por elemento (override de `data.geometry` presente)? */
  edited: boolean;
}

/**
 * Ponte de autoria das **malhas de blockout** (ProBuilder — ADR-0071): o inspector
 * lê os parâmetros da forma e os ajusta (regenera ao vivo), ou reseta a edição de
 * elementos. Implementada pelo `attachEditor` contra o nó em `overlay.data.added`
 * (receita) + `overlay.data.geometry[nome]` (override de geometria). `get` devolve
 * `null` se o objeto não é um nó `mesh`.
 */
export interface MeshApi {
  get(obj: Object3D): MeshShapeState | null;
  /** Ajusta um parâmetro da forma → regenera a malha ao vivo + persiste. */
  setParam(obj: Object3D, key: string, value: number): void;
  /** Remove a edição de elementos (volta à receita paramétrica). */
  resetGeometry(obj: Object3D): void;
  // ── Edição de elementos (Fase 2 — só quando o MeshEditSystem está ligado) ──────
  /** Modo de edição atual (`object`/`vertex`/`edge`/`face`). */
  editMode?(obj: Object3D): 'object' | 'vertex' | 'edge' | 'face';
  /** Entra/sai da edição de elementos (`object` = sair). */
  setEditMode?(obj: Object3D, mode: 'object' | 'vertex' | 'edge' | 'face'): void;
  /** Há uma face selecionada (habilita "Extrudar")? */
  hasFaceSelected?(): boolean;
  /** Extruda a face selecionada. */
  extrudeSelected?(): void;
}

/** Estado de uma estrada selecionada (ADR-0072). `null` se não é um nó `road`. */
export interface RoadEditState {
  /** Nome da superfície atual (`asphalt`/…) ou `'custom'` se URLs explícitas. */
  surface: string;
  /** Largura da pista (m). */
  width: number;
  /**
   * Como o terreno se relaciona com a pista (Fase 2): `'conform'` (a pista se deforma
   * no relevo) ou `'cutfill'` (o terreno se adapta à pista — corte/aterro + talude).
   */
  terrainMode: 'conform' | 'cutfill';
  /** Largura do talude (transição) por lado, m. Só relevante em `cutfill`. */
  taludeWidth: number;
  /** Inclinação máx. do greide (razão Δalt/Δhoriz). Só relevante em `cutfill`. */
  maxSlope: number;
  /** Marcação de pista: nome embutido, `'custom'` (URL), ou `'none'`. */
  markings: string;
}

/**
 * Ponte de autoria de **estradas** (Road Architect → Cortex, ADR-0072): o inspector
 * escolhe a superfície (asfalto/concreto/…) e a largura; regenera a malha ao vivo e
 * persiste no nó (`data.added`). `get` devolve `null` se o objeto não é uma estrada.
 */
export interface RoadApi {
  get(obj: Object3D): RoadEditState | null;
  /** Troca a superfície (nome do catálogo) → regenera + persiste. */
  setSurface(obj: Object3D, name: string): void;
  /** Define a superfície por URLs de textura (diffuse + normal opcional) → regenera. */
  setSurfaceTexture(obj: Object3D, surface: { diffuse: string; normal?: string }): void;
  /** Ajusta a largura (m) → regenera + persiste. */
  setWidth(obj: Object3D, width: number): void;
  /** Troca o modo de terreno (`conform`/`cutfill`) → regenera pista + remolda terreno. */
  setTerrainMode(obj: Object3D, mode: 'conform' | 'cutfill'): void;
  /** Ajusta a largura do talude (m, modo `cutfill`) → remolda o terreno. */
  setTalude(obj: Object3D, taludeWidth: number): void;
  /** Ajusta a inclinação máx. do greide (razão, modo `cutfill`) → regenera + remolda. */
  setMaxSlope(obj: Object3D, maxSlope: number): void;
  /** Troca a marcação de pista (nome do catálogo ou `'none'`) → regenera o overlay. */
  setMarkings(obj: Object3D, name: string): void;
  /** Abre o modal de seleção de textura (atribuído pelo attachEditor). Opcional. */
  pickSurface?(obj: Object3D): void;
  /** Entra na edição do traçado (handles nos pontos — atribuído pelo attachEditor). Opcional. */
  editNodes?(obj: Object3D): void;
}

/** Modo do pincel de terreno: esculpir altura ou pintar textura. */
export type TerrainBrushMode = 'sculpt' | 'paint';

/** Estado do terreno selecionado (pincel). `null` se não é terreno. */
export interface TerrainEditState {
  /** Pincel ativo no terreno (esculpindo/pintando)? */
  sculpting: boolean;
  /** Modo do pincel: `sculpt` (altura) ou `paint` (textura). */
  mode: TerrainBrushMode;
  /** Raio do pincel (unidades de mundo). */
  radius: number;
  /** Força (quanto sobe/abaixa, ou opacidade da pintura, por pincelada). */
  strength: number;
  /** Texturas disponíveis no projeto (caminhos, ex. `assets/textures/grama.png`). */
  textures: string[];
  /** Textura ativa do modo pintar, ou `null` (nenhuma escolhida). */
  texture: string | null;
  /** Tiling da textura ativa (repetições ao longo do terreno). */
  repeat: number;
}

/**
 * Ponte de autoria do **terreno**: o inspector liga/desliga o pincel, alterna o
 * modo (esculpir altura / texturizar) e escolhe/importa a textura. Implementada
 * pelo `attachEditor` contra o {@link Terrain} (em `mesh.userData.cortexTerrain`) +
 * a overlay (`data.terrain[nome]` = heightmap; `data.terrainPaint[nome]` =
 * camadas + splatmap). `get` devolve `null` se o objeto não é um terreno.
 */
export interface TerrainApi {
  get(obj: Object3D): TerrainEditState | null;
  /** Entra/sai do modo pincel (esculpir/pintar conforme o modo). */
  startSculpt(obj: Object3D): void;
  stopSculpt(): void;
  /** Ajusta o pincel (raio + força). */
  setBrush(radius: number, strength: number): void;
  /** Troca o modo do pincel (esculpir altura ⇄ pintar textura). */
  setMode(mode: TerrainBrushMode): void;
  /** Escolhe a textura ativa do modo pintar (aloca uma camada no terreno). */
  setTexture(obj: Object3D, url: string): void;
  /** Ajusta o tiling da textura ativa e persiste. */
  setRepeat(obj: Object3D, repeat: number): void;
  /**
   * **Importa** uma textura pra dentro do projeto (grava em `assets/textures/` via
   * o endpoint de upload do dev server) e a torna a textura ativa. `dataUrl` é o
   * conteúdo do arquivo (data URL lida do seletor de arquivo).
   */
  importTexture(obj: Object3D, name: string, dataUrl: string): void;
  /** Abre o modal de seleção de textura com preview (atribuído pelo attachEditor). Opcional. */
  pickTexture?(obj: Object3D): void;
}

/** Estado da vegetação selecionada (pincel de espalhar — ADR-0077). `null` se não é. */
export interface VegetationEditState {
  /** Pincel ativo nesta vegetação? */
  painting: boolean;
  /** Raio do pincel (unidades de mundo). */
  radius: number;
  /** Quantas instâncias por pincelada (densidade). */
  density: number;
  /** Escala mínima/máxima sorteada por instância. */
  scaleMin: number;
  scaleMax: number;
  /** Quantas instâncias já espalhadas. */
  count: number;
  /** Modelo atual (`.glb` URL) ou `''` = placeholder procedural. */
  model: string;
  /** `.glb` disponíveis no projeto (pra o seletor de modelo). */
  models: string[];
  /** Colide com o player (vira `cortexSolid`). */
  collide: boolean;
}

/**
 * Ponte de autoria da **vegetação** (ADR-0077): o inspector liga/desliga o pincel de
 * espalhar e ajusta raio/densidade/escala. Implementada pelo `attachEditor` contra a
 * {@link Vegetation} (em `userData.cortexVegetation`); as instâncias persistem no nó
 * (`data.added`). `get` devolve `null` se o objeto não é vegetação.
 */
export interface VegetationApi {
  get(obj: Object3D): VegetationEditState | null;
  /** Entra/sai do modo pincel. */
  startPaint(obj: Object3D): void;
  stopPaint(): void;
  /** Ajusta o pincel (raio + densidade). */
  setBrush(radius: number, density: number): void;
  /** Ajusta a faixa de escala sorteada por instância. */
  setScale(min: number, max: number): void;
  /** Troca o modelo (`.glb` URL, ou `''` = placeholder) — reconstrói as instâncias. */
  setModel(obj: Object3D, url: string): void;
  /** Liga/desliga a colisão com o player (`cortexSolid`). */
  setCollide(obj: Object3D, on: boolean): void;
  /** Remove UMA instância (árvore) do grupo pelo índice + persiste. `true` se removeu. */
  deleteInstance(obj: Object3D, index: number): boolean;
  /** Abre o modal de seleção de modelo com preview (atribuído pelo attachEditor). Opcional. */
  pickModel?(obj: Object3D): void;
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

/**
 * Estado editável do **veículo** (ADR-0081) — valores efetivos (dado da cena + overlay).
 * `comY`/`comZ` = centro de massa (altura / frente-trás), mapeados pra `chassisOffset`.
 */
export interface VehicleEditState {
  engineForce: number;
  maxBrake: number;
  handbrakeForce: number;
  rollingResistance: number;
  maxSteer: number;
  mass: number;
  frictionSlip: number;
  suspensionStiffness: number;
  suspensionRestLength: number;
  comY: number;
  comZ: number;
  maxSpeed: number;
  /** Caminho do áudio do motor (ou '' se nenhum). */
  engineSound: string;
}

/**
 * Autoria do **veículo** — seção "Veículo" do Inspector (ADR-0081). Lê/grava a config do
 * carro (`data.vehicle[id]` no overlay; nó marcado com `userData.cortexVehicle`). Aplica
 * ao recarregar/dar play (o jogo lê a config ao criar o veículo).
 */
export interface VehicleApi {
  /** Estado efetivo, ou `null` se o objeto não é um veículo. */
  get(obj: Object3D): VehicleEditState | null;
  /** Edita um campo (`engineForce`, `comZ`, …) e persiste no overlay. */
  set(obj: Object3D, key: keyof VehicleEditState, value: number): void;
  /**
   * Importa um ÁUDIO de motor (FileField → `{ name, dataUrl }`): faz upload pro projeto
   * e grava `engineSound` com o caminho. Aplica ao dar play (o jogo carrega o som).
   */
  importSound(obj: Object3D, name: string, dataUrl: string): void;
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
  /**
   * Opcional: autoria do **tipo de corpo físico** (Nenhum/Estático/Character) — o
   * seletor "Tipo" estilo UPBGE. Quando presente, o Inspector mostra a seção
   * **Física**. Ver {@link PhysicsApi}.
   */
  physicsApi?: PhysicsApi;
  /** Opcional: autoria do **veículo** (motor/freio/suspensão/centro de massa) — seção "Veículo". Ver {@link VehicleApi}. */
  vehicleApi?: VehicleApi;
  /** Opcional: autoria/persistência do toggle Fosco (matte). Ver {@link MatteApi}. */
  matteApi?: MatteApi;
  /** Opcional: autoria/persistência do material/shader por objeto. Ver {@link MaterialApi}. */
  materialApi?: MaterialApi;
  /** Opcional: autoria das malhas de blockout (forma paramétrica/reset). Ver {@link MeshApi}. */
  meshApi?: MeshApi;
  /** Opcional: autoria de estradas (superfície/largura). Ver {@link RoadApi}. */
  roadApi?: RoadApi;
  /** Opcional: pincel de esculpir terreno. Ver {@link TerrainApi}. */
  terrainApi?: TerrainApi;
  /** Opcional: pincel de espalhar vegetação. Ver {@link VegetationApi}. */
  vegetationApi?: VegetationApi;
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
    physicsApi,
    vehicleApi,
    matteApi,
    materialApi,
    meshApi,
    roadApi,
    terrainApi,
    vegetationApi,
    animationApi,
    playerAnimationsApi,
    writeBack,
    registry = createObjectRegistry(),
  } = options;
  const ctx: InspectorContext = { colliderApi, physicsApi, vehicleApi, matteApi, materialApi, meshApi, roadApi, terrainApi, vegetationApi, animationApi, playerAnimationsApi, writeBack };

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
