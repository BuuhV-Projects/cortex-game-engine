import {
  PerspectiveCamera,
  Vector3,
  Vector2,
  Box3,
  Plane,
  Raycaster,
  CameraHelper,
  DirectionalLight,
  PointLight,
  SpotLight,
  DirectionalLightHelper,
  PointLightHelper,
  SpotLightHelper,
  Mesh,
  RingGeometry,
  MeshBasicMaterial,
  DoubleSide,
  type Object3D,
} from 'three';
import type { Game, GameEditor } from '../core/Game.js';
import { debug } from '../core/debug.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { EditableTargetComponent } from '../components/EditableTargetComponent.js';
import type { Entity } from '../ecs/Entity.js';
import { createEditorState } from './EditorState.js';
import { createEditorSelection } from './EditorSelection.js';
import { createEditorHud } from './EditorHud.js';
import { createEditorOutliner } from './EditorOutliner.js';
import { createEditorInspector } from './EditorInspector.js';
import { TerrainComponent } from '../components/TerrainComponent.js';
import { TerrainCollisionSystem } from '../systems/TerrainCollisionSystem.js';
import { createEditorAddPanel } from './EditorAddPanel.js';
import { assetUrlFromDataTransfer, isAssetDrag, isEditorInternalHit, ndcFromClient, worldDropPoint } from './assetDrop.js';
import { createRenameApi, type RenameApi } from './authoring/RenameAuthoring.js';
import { modelThumb } from './ModelThumbs.js';
import { createShadowApi } from './authoring/ShadowAuthoring.js';
import { createEditorShapePanel } from './EditorShapePanel.js';
import { SHAPES, type ShapeKind } from '../probuilder/shapes.js';
import { createObjectRegistry } from './EditorModel.js';
import { createAuthoringContext } from './authoring/AuthoringContext.js';
import { createColliderApi } from './authoring/ColliderAuthoring.js';
import { createPhysicsApi } from './authoring/PhysicsAuthoring.js';
import { createVehicleApi } from './authoring/VehicleAuthoring.js';
import { createUnderlayApi } from './authoring/UnderlayAuthoring.js';
import { createScriptApi } from './authoring/ScriptAuthoring.js';
import { createMatteApi } from './authoring/MatteAuthoring.js';
import { createMaterialApi } from './authoring/MaterialAuthoring.js';
import { createMeshApi } from './authoring/MeshAuthoring.js';
import { createEditorTexturePicker, type TextureItem } from './EditorTexturePicker.js';
import { MeshEditSystem } from './MeshEditSystem.js';
import { createMeshEditToolbar } from './MeshEditToolbar.js';
import { ShapeDrawSystem } from './ShapeDrawSystem.js';
import { createAnimationApi, createPlayerAnimationsApi } from './authoring/AnimationAuthoring.js';
import { createTerrainAuthoring } from './authoring/TerrainAuthoring.js';
import { createVegetationAuthoring } from './authoring/VegetationAuthoring.js';
import { createEditorBridge } from './EditorBridge.js';
import { EditorCameraSystem } from './EditorCameraSystem.js';
import { ObjectEditSystem } from './ObjectEditSystem.js';
import { CommandStack } from './CommandStack.js';
import type { GizmoTransform } from './ObjectEditSystem.js';
import { ColliderGizmoSystem } from './ColliderGizmoSystem.js';
import { CharacterColliderGizmoSystem } from './CharacterColliderGizmoSystem.js';
import { VegetationGizmoSystem } from './VegetationGizmoSystem.js';
import type { VegetationPickHook } from './ObjectEditSystem.js';
import type { Vegetation } from '../scene/Vegetation.js';
import { SceneLoader } from '../scene/SceneLoader.js';
import { addSceneNode } from '../scene/SceneBuilder.js';
import type { Terrain } from '../scene/Terrain.js';
import type { SceneNode } from '../scene/SceneDefinition.js';
import { emptySceneFile, type SceneFileV1 } from '../scene/SceneFile.js';
import { autoDetectSceneFileWriter } from '../io/autoDetectSceneFileWriter.js';

// O caminho do overlay vem de `game.sceneDataUrl` (por fase — default
// 'assets/scene-data.json', pareia com o target default do createSceneSavePlugin).

/** Layer (0–31) dos helpers de edição — habilitada SÓ na câmera do editor. */
const EDITOR_HELPER_LAYER = 30;

type SavedTransform = SceneFileV1['objects'][string];

function transformOf(o: Object3D): SavedTransform {
  return {
    position: [o.position.x, o.position.y, o.position.z],
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
    scale: [o.scale.x, o.scale.y, o.scale.z],
  };
}

function sameTransform(a: SavedTransform, b: SavedTransform): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.position[i] !== b.position[i]) return false;
    if (a.rotation[i] !== b.rotation[i]) return false;
    if (a.scale[i] !== b.scale[i]) return false;
  }
  return true;
}

/**
 * Liga o **modo editor completo** a um {@link Game}: câmera de voo livre (F2),
 * gizmo, HUD, hierarquia e inspector, com reatividade nos dois sentidos. É
 * registrado automaticamente pelo bundle de desenvolvimento do engine
 * (`index.dev.js`); em produção o editor não está no bundle (ADR-0042).
 *
 * **Persistência (write-back):** as edições do editor são salvas numa *overlay*
 * (`SceneFileV1` no caminho de `game.sceneDataUrl` — default
 * `assets/scene-data.json`, um arquivo POR FASE) via `autoDetectSceneFileWriter`
 * (dev: POST pro `createSceneSavePlugin`; Tauri: fs). O `buildScene` aplica essa
 * overlay no boot — mover/rotacionar persiste (override), Delete persiste (o nó
 * é pulado pelo loader, **sem create-then-remove**). Auto-save (sem precisar de
 * tecla); o jogo precisa carregar a overlay e passá-la ao `buildScene`.
 */
export function attachEditor(game: Game): GameEditor {
  const three = game.scene.getThreeScene();
  const editorState = createEditorState();
  const selection = createEditorSelection();
  // Registro de ids compartilhado entre os painéis in-canvas e a ponte com a IDE
  // (ADR-0056), pra os ids de objeto baterem entre os dois renderizadores.
  const registry = createObjectRegistry();
  const hud = createEditorHud();

  // **Boot em modo EDIÇÃO por padrão** (estilo Unity): o jogo abre editável, com a
  // gameplay pausada; o usuário aperta ▶ Play pra jogar. Override `?play` na URL
  // boota direto em modo jogo (usado pela tool de playtest da IA, que precisa
  // rodar a gameplay). Em produção não há editor — o jogo sempre roda.
  const bootPlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('play');
  editorState.active = !bootPlay;

  // Botão ▶ Play / ⏹ Stop sempre visível — alterna edit↔play (F2 faz o mesmo).
  // Em modo `?play` puro (playtest da IA) não há UI de editor.
  let playBtn: HTMLButtonElement | null = null;
  if (typeof document !== 'undefined' && !bootPlay) {
    playBtn = document.createElement('button');
    playBtn.style.cssText = [
      'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483001', 'padding:6px 18px', 'border:none', 'border-radius:5px',
      'font-family:"Segoe UI",Roboto,Arial,sans-serif', 'font-size:13px', 'font-weight:600',
      'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,0.4)', 'color:#fff',
    ].join(';');
    playBtn.addEventListener('click', () => {
      editorState.active = !editorState.active;
    });
    document.body.appendChild(playBtn);
  }
  const updatePlayBtn = (): void => {
    if (!playBtn) return;
    playBtn.textContent = editorState.active ? '▶ Play' : '⏹ Stop (editar)';
    playBtn.style.background = editorState.active ? '#2a9d4a' : '#c0392b';
  };
  updatePlayBtn();

  // Snapshot/restore do mundo: Play não destrói o estado de edição — ao parar,
  // tudo volta pra onde estava (estilo Unity). Snapshota ao entrar em Play,
  // restaura ao voltar pra edição.
  let worldSnapshot: Map<Entity, { x: number; y: number; z: number; rotationY: number }> | null = null;
  const snapshotWorld = (): void => {
    const m = new Map<Entity, { x: number; y: number; z: number; rotationY: number }>();
    for (const e of game.world.query(TransformComponent)) {
      const t = e.getComponent(TransformComponent)!;
      m.set(e, { x: t.x, y: t.y, z: t.z, rotationY: t.rotationY });
    }
    worldSnapshot = m;
  };
  const restoreWorld = (): void => {
    if (!worldSnapshot) return;
    for (const [e, s] of worldSnapshot) {
      const t = e.getComponent(TransformComponent);
      if (!t) continue;
      t.x = s.x;
      t.y = s.y;
      t.z = s.z;
      t.rotationY = s.rotationY;
      const b = e.getComponent(PlatformerBodyComponent);
      if (b) {
        b.vx = 0;
        b.vy = 0;
        b.grounded = false;
      }
    }
  };

  const aspect0 = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
  const editorCamera = new PerspectiveCamera(60, aspect0, 0.1, 5000); // far grande: mundo de 640m+ não corta (céu não "cobre")
  // Layer exclusiva dos helpers de edição (frustum da câmera, luzes): só a
  // câmera do EDITOR a renderiza — na câmera do jogo eles não existem.
  editorCamera.layers.enable(EDITOR_HELPER_LAYER);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      editorCamera.aspect = window.innerWidth / window.innerHeight;
      editorCamera.updateProjectionMatrix();
    });
  }

  // Alvo editável "invisível" pra a câmera livre/teleporte/F2 funcionarem sem avatar.
  const target = game.world.createEntity();
  target.addComponent(new TransformComponent(0, 0, 0));
  target.addComponent(new EditableTargetComponent());

  const cameraSystem = new EditorCameraSystem(editorState, editorCamera, game.camera, game.input, three, hud);
  game.world.addSystem(cameraSystem);

  // Contorno dos colliders (AABB) — visível só no modo editor, pra "ver" as hitboxes.
  game.world.addSystem(new ColliderGizmoSystem(editorState, three));
  // Cápsula 3D do player/NPC (CharacterBody), estilo Unity Character Controller.
  game.world.addSystem(new CharacterColliderGizmoSystem(editorState, three));

  // ── Overlay de persistência ──────────────────────────────────────────────────
  const overlay: SceneFileV1 = emptySceneFile();
  // Limpeza ao deletar um nó (atribuída adiante, quando physicsApi/addedList existem).
  // Default no-op pra cobrir a janela antes da atribuição.
  let deleteNode: (obj: import('three').Object3D) => void = () => {};
  const deletedList = (): string[] => {
    const d = overlay.data['deleted'];
    if (Array.isArray(d)) return d as string[];
    const arr: string[] = [];
    overlay.data['deleted'] = arr;
    return arr;
  };
  // Overlay POR FASE (ver Game.sceneDataUrl): o caminho vem do jogo e pode
  // mudar quando ele troca de fase (menu) — aí recarregamos a base e passamos
  // a salvar no arquivo novo. Semear com a overlay já existente evita
  // sobrescrever edições anteriores; arquivo ausente = base vazia.
  // NOTA: troca o objeto `overlay.data` — por isso o AuthoringContext lê
  // `overlay.data` dinamicamente (não captura por referência). Ver AuthoringContext.
  let writer = autoDetectSceneFileWriter({ path: game.sceneDataUrl });
  const seedOverlay = (): void => {
    void new SceneLoader()
      .loadSceneFile(game.sceneDataUrl)
      .then((f) => {
        overlay.objects = f ? f.objects : {};
        overlay.data = f ? f.data : {};
      })
      .catch(() => {});
  };
  seedOverlay();
  game.onSceneDataUrlChange((url) => {
    debug('persist', 'sceneDataUrl mudou →', url);
    writer = autoDetectSceneFileWriter({ path: url });
    seedOverlay();
  });

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = (immediate = false): void => {
    if (!writer) {
      debug('persist', 'SEM WRITER — não salva');
      return;
    }
    const save = (): void => {
      debug('persist', immediate ? 'imediato' : 'debounced', 'data=', overlay.data);
      // Lê `writer` NA HORA do save (é `let`: troca junto com o sceneDataUrl).
      void writer
        ?.save(overlay)
        .then(() => debug('persist', 'OK'))
        .catch((e) => debug('persist', 'FALHOU', e));
    };
    if (immediate) {
      save();
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save();
    }, 500);
  };

  // Contexto compartilhado das autorias (ADR-0060) — cada módulo mexe só no seu
  // pedaço do overlay (ctx.record) + aplica ao vivo. O attachEditor é o compositor.
  const authoring = createAuthoringContext(game, three, overlay, persist);

  // Write-back do transform pro ECS: editar via gizmo OU inspector escreve no
  // TransformComponent — senão o Object3DSyncSystem sobrescreve no próximo tick
  // (posição + rotação Y; rotX/Z e escala ficam no Object3D, que o sync não toca).
  const writeBackTransform = (obj: Object3D): void => {
    let matched = false;
    for (const e of game.world.query(Object3DComponent)) {
      if (e.getComponent(Object3DComponent)!.object !== obj) continue;
      const t = e.getComponent(TransformComponent);
      if (t) {
        t.x = obj.position.x;
        t.y = obj.position.y;
        t.z = obj.position.z;
        t.rotationY = obj.rotation.y;
        matched = true;
      }
      // NÃO parar na primeira: pode haver mais de uma entidade presa ao mesmo
      // Object3D — todas precisam do transform novo (a última que o sync escrever
      // venceria com o valor VELHO).
    }
    debug('editor', 'writeBack', obj.name || '(sem nome)', 'entidade?', matched, 'rotY', obj.rotation.y.toFixed(3));
  };

  // Seleção por INSTÂNCIA de vegetação (ADR-0077 fase 3): clicar numa árvore mostra a
  // caixa só nela; selecionar o grupo mostra em todas; Delete remove a árvore clicada.
  // `deleteVegInstance` é late-bound (a autoria de vegetação nasce mais abaixo).
  const vegGizmo = new VegetationGizmoSystem(editorState, three);
  game.world.addSystem(vegGizmo);
  let vegSel: { obj: Object3D; veg: Vegetation; index: number } | null = null;
  let deleteVegInstance: ((obj: Object3D, index: number) => boolean) | null = null;
  const vegOfGroup = (g: Object3D): Vegetation | undefined =>
    (g.userData as Record<string, unknown>)['cortexVegetation'] as Vegetation | undefined;
  const vegHook: VegetationPickHook = {
    onInstance: (group, index) => {
      const veg = vegOfGroup(group);
      if (!veg) return;
      vegSel = { obj: group, veg, index };
      vegGizmo.show(veg, group, index);
    },
    onGroup: (group) => {
      const veg = vegOfGroup(group);
      if (!veg) {
        vegHook.onOther();
        return;
      }
      vegSel = { obj: group, veg, index: -1 };
      vegGizmo.show(veg, group, -1);
    },
    onOther: () => {
      vegSel = null;
      vegGizmo.hide();
    },
    onDelete: () => {
      if (!vegSel || vegSel.index < 0) return false;
      const ok = deleteVegInstance?.(vegSel.obj, vegSel.index) ?? false;
      if (ok) {
        vegGizmo.hide();
        vegSel = null;
      }
      return ok;
    },
  };

  const history = new CommandStack(); // CTRL+Z (ADR-0084) — fase 1: transform/add/delete
  const objectEditSystem = new ObjectEditSystem(
      editorState,
      editorCamera,
      game.canvas,
      game.scene,
      [three],
      game.input,
      hud,
      () => {
        persist(true);
        hud.showToast('Cena salva');
      }, // onSaveEdits (K) — salva já
      () => {}, // onClearEdits
      writeBackTransform, // gizmo → TransformComponent
      (obj) => cameraSystem.focusOn(obj),
      selection,
      (obj) => deleteNode(obj), // limpeza completa (física + overlay); ver `deleteNode` abaixo
      // Edição com TODOS os eixos livres (mover/rotacionar/escalar em X/Y/Z) +
      // snap de grade. Embora a gameplay seja 2.5D (plano XY), o editor é 3D pleno
      // — útil pra profundidade/parallax em Z e decoração. As edições persistem:
      // posição e rotY pelo write-back no Transform; rotX/Z e escala ficam no
      // Object3D (o Object3DSyncSystem não as sobrescreve).
      { snap: 0.5 },
      vegHook, // seleção/Delete por instância de árvore
  );
  game.world.addSystem(objectEditSystem);

  // Undo de TRANSFORM: ao soltar o gizmo (mudou), registra antes/depois no histórico.
  objectEditSystem.onTransformCommit = (obj, before, after) => {
    const apply = (t: GizmoTransform): void => {
      obj.position.set(t.position[0], t.position[1], t.position[2]);
      obj.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
      obj.scale.set(t.scale[0], t.scale[1], t.scale[2]);
      writeBackTransform(obj);
      if (obj.name) {
        (overlay.objects ??= {})[obj.name] = {
          position: [...t.position], rotation: [...t.rotation], scale: [...t.scale],
        };
      }
      persist();
      selection.requestSelect(obj); // gizmo segue o objeto desfeito/refeito
      refreshUI();
    };
    history.push({ label: 'Transform', undo: () => apply(before), redo: () => apply(after) });
  };

  // CTRL+Z desfaz / CTRL+SHIFT+Z (ou CTRL+Y) refaz — só no editor, fora de campos de texto.
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (!editorState.active || !(e.ctrlKey || e.metaKey)) return;
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        hud.showToast(history.undo() ? '↶ Desfez' : 'Nada pra desfazer');
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        hud.showToast(history.redo() ? '↷ Refez' : 'Nada pra refazer');
      }
    });
  }

  const outliner = createEditorOutliner({ editRoots: [three], selection, registry, onFocus: (obj) => cameraSystem.focusOn(obj) });

  // A câmera do JOGO vira um objeto visível/selecionável no editor: entra na
  // hierarquia (nomeada) e ganha um frustum (CameraHelper). No modo edição a
  // navegação usa uma câmera de voo SEPARADA, então dá pra ver de fora como a
  // câmera do jogo enquadra a cena. O frustum só aparece no modo edição.
  // Helpers do editor (frustum da câmera, visuais de luz) NÃO capturam o clique de
  // seleção (raycast no-op) e ficam translúcidos — senão "roubam" o clique dos
  // objetos e tampam a cena. Continuam na hierarquia (não viram editorInternal).
  const prepHelper = (obj: Object3D): void => {
    obj.traverse((o) => {
      o.raycast = () => {};
      // Helpers vivem numa LAYER que só a câmera do editor renderiza (abaixo):
      // a câmera do JOGO nunca os desenha — sem isso, o cross do far-plane do
      // CameraHelper aparecia como listras no meio da tela durante o Play.
      o.layers.set(EDITOR_HELPER_LAYER);
      const mat = (o as { material?: unknown }).material;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of mats as Array<{ transparent: boolean; opacity: number; depthWrite: boolean }>) {
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
      }
    });
  };

  if (!game.camera.name) game.camera.name = 'Camera';
  if (game.camera.parent !== three) three.add(game.camera);
  const cameraHelper = new CameraHelper(game.camera);
  cameraHelper.visible = editorState.active; // segue o modo (boot em edição já mostra)
  three.add(cameraHelper);
  cameraHelper.update();
  prepHelper(cameraHelper);

  // Helpers de LUZ (estilo Blender): cada luz ganha um visual no modo edição —
  // direção (Directional), esfera (Point), cone (Spot). Sem isso, clicar numa luz dá
  // só os eixos do gizmo num ponto invisível. Ambient E Hemisphere NÃO têm helper
  // (são globais/sem posição útil — o octaedro da hemisférica só poluía a cena, na
  // origem, embaixo do player). Ressincronizado quando a cena muda (luzes carregam
  // async pelo buildScene).
  type LightHelper = Object3D & { update?(): void; dispose?(): void };
  const lightHelpers = new Map<Object3D, LightHelper>();
  const syncLightHelpers = (visible: boolean): void => {
    const present = new Set<Object3D>();
    three.traverse((o) => {
      const make =
        o instanceof DirectionalLight
          ? (): LightHelper => new DirectionalLightHelper(o, 2)
          : o instanceof PointLight
            ? (): LightHelper => new PointLightHelper(o, 0.5)
            : o instanceof SpotLight
              ? (): LightHelper => new SpotLightHelper(o)
              : null;
      if (!make) return;
      present.add(o);
      let h = lightHelpers.get(o);
      if (!h) {
        h = make();
        three.add(h);
        lightHelpers.set(o, h);
        prepHelper(h);
      }
      h.visible = visible;
      h.update?.();
    });
    for (const [light, h] of lightHelpers) {
      if (present.has(light)) continue;
      three.remove(h);
      h.dispose?.();
      lightHelpers.delete(light);
    }
  };
  syncLightHelpers(editorState.active);

  // ── Collider como propriedade do objeto (autoria no editor) ──────────────────
  // O collider é uma entidade ECS ACOPLADA ao mesh (Object3DComponent.object ===
  // obj) — então movem juntos. Editar/criar/remover persiste em
  // `overlay.data.colliders[nome]`; o `buildScene` recria no boot (código vence).
  type ColliderEntry = Record<string, unknown>;
  const collidersMap = (): Record<string, ColliderEntry> => {
    const c = overlay.data['colliders'];
    if (c && typeof c === 'object' && !Array.isArray(c)) return c as Record<string, ColliderEntry>;
    const m: Record<string, ColliderEntry> = {};
    overlay.data['colliders'] = m;
    return m;
  };
  const findColliderEntity = (obj: Object3D): Entity | null => {
    for (const e of game.world.query(Collider2DComponent)) {
      if (e.getComponent(Object3DComponent)?.object === obj) return e;
    }
    return null;
  };

  // ── Heightfield: desenhar / editar / auto-traçar o perfil do chão ────────────
  const _ray = new Raycaster();
  const _ndc = new Vector2();
  const _plane = new Plane();
  const _hit = new Vector3();
  const _proj = new Vector3();
  const _zNormal = new Vector3(0, 0, 1);
  let draw:
    | { obj: Object3D; entity: Entity; points: [number, number][]; minY: number; maxY: number; dragging: number | null }
    | null = null;

  const ensureHeightfieldEntity = (obj: Object3D): Entity => {
    let entity = findColliderEntity(obj);
    if (!entity) {
      entity = game.world.createEntity();
      entity.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z, obj.rotation.y));
      entity.addComponent(new Object3DComponent(obj));
      entity.addComponent(new Collider2DComponent(0.01, 0.01, true, false, 0, 0, 'heightfield', []));
    }
    return entity;
  };

  // Escreve os pontos no componente (ORDENADO por X) + overlay. Não muta `pts`.
  const setHeightfieldPoints = (entity: Entity, obj: Object3D, pts: readonly (readonly [number, number])[]): void => {
    const sorted = pts.map((p) => [p[0], p[1]] as [number, number]).sort((a, b) => a[0] - b[0]);
    const c = entity.getComponent(Collider2DComponent)!;
    c.shape = 'heightfield';
    c.points = sorted;
    if (sorted.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of sorted) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      c.halfWidth = Math.max((maxX - minX) / 2, 0.01);
      c.halfHeight = Math.max((maxY - minY) / 2, 0.01);
    }
    if (obj.name) {
      collidersMap()[obj.name] = { shape: 'heightfield', solid: true, oneWay: false, points: sorted.map((p) => [p[0], p[1]]) };
    }
    persist();
  };

  const writeHeightfield = (): void => {
    if (draw) setHeightfieldPoints(draw.entity, draw.obj, draw.points);
  };

  // Posição LOCAL do clique: raycast no mesh (superfície visível); fallback no
  // plano Z com Y clampado ao bbox (nunca escapa pro céu/subsolo).
  const localFromClick = (clientX: number, clientY: number): [number, number] | null => {
    if (!draw) return null;
    const rect = game.canvas.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ndc, editorCamera);
    const hits = _ray.intersectObject(draw.obj, true);
    let wx: number;
    let wy: number;
    if (hits.length > 0) {
      wx = hits[0]!.point.x;
      wy = hits[0]!.point.y;
    } else {
      _plane.set(_zNormal, -draw.obj.position.z);
      if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
      const margin = Math.max(draw.maxY - draw.minY, 1);
      wx = _hit.x;
      wy = Math.min(Math.max(_hit.y, draw.minY - margin), draw.maxY + margin);
    }
    return [wx - draw.obj.position.x, wy - draw.obj.position.y];
  };

  // Índice do ponto do heightfield sob o clique (distância em px), ou -1.
  const pickPoint = (clientX: number, clientY: number): number => {
    if (!draw) return -1;
    const rect = game.canvas.getBoundingClientRect();
    let best = -1;
    let bestD = 14; // limiar em px
    for (let i = 0; i < draw.points.length; i++) {
      _proj.set(draw.obj.position.x + draw.points[i]![0], draw.obj.position.y + draw.points[i]![1], draw.obj.position.z);
      _proj.project(editorCamera);
      const sx = (_proj.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-_proj.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const finishDraw = (): void => {
    if (!draw) return;
    const obj = draw.obj;
    draw = null;
    editorState.drawingHeightfield = false;
    hud.showToast('Heightfield salvo');
    selection.requestSelect(obj); // reabre o inspector com o collider
  };

  const startDraw = (obj: Object3D): void => {
    if (!obj.name) {
      hud.showToast('Dê um nome ao objeto antes de desenhar o chão');
      return;
    }
    selection.requestSelect(null); // solta o gizmo/seleção
    const entity = ensureHeightfieldEntity(obj);
    const c = entity.getComponent(Collider2DComponent)!;
    const existing = (c.points ?? []).map((p) => [p[0], p[1]] as [number, number]);
    const bb = new Box3().setFromObject(obj);
    draw = { obj, entity, points: existing, minY: bb.min.y, maxY: bb.max.y, dragging: null };
    editorState.drawingHeightfield = true;
    hud.showToast('Chão: CLIQUE adiciona ponto · ARRASTE um ponto pra mover · Backspace desfaz · Enter finaliza');
  };

  // Auto-traça o perfil amostrando o TOPO do mesh (raycast pra baixo no z central
  // — pega o deck e ignora corrimãos, que ficam fora do z central). Ponto de
  // partida; refine arrastando/desenhando.
  const autoTraceHeightfield = (obj: Object3D): void => {
    if (!obj.name) {
      hud.showToast('Dê um nome ao objeto antes de auto-traçar');
      return;
    }
    const bb = new Box3().setFromObject(obj);
    const z = obj.position.z;
    const top = bb.max.y + Math.max(bb.max.y - bb.min.y, 1) * 0.1 + 0.5;
    const N = 24;
    const pts: [number, number][] = [];
    const origin = new Vector3();
    const down = new Vector3(0, -1, 0);
    for (let i = 0; i <= N; i++) {
      const wx = bb.min.x + ((bb.max.x - bb.min.x) * i) / N;
      origin.set(wx, top, z);
      _ray.set(origin, down);
      const hits = _ray.intersectObject(obj, true);
      if (hits.length > 0) pts.push([wx - obj.position.x, hits[0]!.point.y - obj.position.y]);
    }
    if (pts.length < 2) {
      hud.showToast('Não consegui traçar (sem superfície sob a amostra)');
      return;
    }
    setHeightfieldPoints(ensureHeightfieldEntity(obj), obj, pts);
    hud.showToast(`Perfil traçado: ${pts.length} pontos (ajuste arrastando se quiser)`);
    selection.requestSelect(obj);
  };

  game.canvas.addEventListener('pointerdown', (e) => {
    if (!draw || e.button !== 0) return;
    e.preventDefault();
    const hit = pickPoint(e.clientX, e.clientY);
    if (hit >= 0) {
      draw.dragging = hit; // pegou um ponto existente → arrastar
      return;
    }
    const lp = localFromClick(e.clientX, e.clientY);
    if (lp) {
      draw.points.push(lp);
      writeHeightfield();
    }
  });
  game.canvas.addEventListener('pointermove', (e) => {
    if (!draw || draw.dragging === null) return;
    e.preventDefault();
    const lp = localFromClick(e.clientX, e.clientY);
    if (lp) {
      draw.points[draw.dragging] = lp;
      writeHeightfield();
    }
  });
  game.canvas.addEventListener('pointerup', () => {
    if (draw) draw.dragging = null;
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (!draw) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        finishDraw();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        draw.points.pop();
        writeHeightfield();
      }
    });
  }
  // CRUD do collider extraído pra módulo (ADR-0060); o heightfield interativo
  // (desenho no viewport) fica aqui e é injetado.
  const colliderApi = createColliderApi(authoring, {
    startHeightfield: startDraw,
    autoHeightfield: autoTraceHeightfield,
  });

  // ── Autorias como módulos (ADR-0060): física (tipo de corpo), fosco, material ──
  const physicsApi = createPhysicsApi(authoring, colliderApi);
  const vehicleApi = createVehicleApi(authoring);
  const underlayApi = createUnderlayApi(authoring);
  const scriptApi = createScriptApi(authoring);
  const matteApi = createMatteApi(authoring);
  const materialApi = createMaterialApi(authoring);

  // ── Blockout (ProBuilder — ADR-0071): autoria de forma + edição de elementos ──
  const meshAuthoring = createMeshApi(authoring);
  let terrainTextures: TextureItem<string>[] = [];
  let vegModels: TextureItem<string>[] = []; // modelos de vegetação (.glb) com thumbnail
  let allModelUrls: string[] = []; // todos os .glb do projeto (picker "Adicionar modelo")
  let refreshUI: () => void = () => {};
  const texturePicker = createEditorTexturePicker();
  // Barra flutuante estilo Unity (chrome de viewport — NÃO some no modo bridge da IDE).
  const meshToolbar = createMeshEditToolbar({
    onMode: (mode) => (mode === 'object' ? meshEditSystem.exit() : meshEditSystem.enter(mode)),
    onExtrude: () => meshEditSystem.extrudeSelected(),
  });
  const meshEditSystem = new MeshEditSystem(
    editorState,
    editorCamera,
    game.canvas,
    game.scene,
    game.input,
    hud,
    selection,
    meshAuthoring,
    meshToolbar,
  );
  game.world.addSystem(meshEditSystem);
  // O `meshApi` do Inspector = autoria de forma + controles de edição de elemento
  // (delegam ao MeshEditSystem). Mantém a UI declarativa (EditorModel) desacoplada.
  const meshApi = {
    ...meshAuthoring,
    editMode: () => meshEditSystem.mode,
    setEditMode: (_obj: import('three').Object3D, mode: 'object' | 'vertex' | 'edge' | 'face') =>
      mode === 'object' ? meshEditSystem.exit() : meshEditSystem.enter(mode),
    hasFaceSelected: () => meshEditSystem.hasFaceSelected(),
    extrudeSelected: () => meshEditSystem.extrudeSelected(),
  };

  // ── Terreno: pincel de esculpir (raise/lower) ────────────────────────────────
  // CRUD/sessão/persistência extraídos pra TerrainAuthoring (ADR-0060); aqui ficam
  // os efeitos de UI (anel do pincel, gizmo, hud) e a interação no viewport (raycast
  // do cursor + listeners de ponteiro). ObjectEditSystem cede o clique quando
  // editorState.sculptingTerrain está ligado.
  // Anel do pincel (igual à Unity): segue o cursor no terreno, mostra raio/lugar.
  const brushRing = new Mesh(
    new RingGeometry(0.9, 1, 48),
    new MeshBasicMaterial({ color: 0xffe24a, side: DoubleSide, transparent: true, opacity: 0.9, depthTest: false }),
  );
  brushRing.rotation.x = -Math.PI / 2; // deitado no plano XZ (chão)
  brushRing.renderOrder = 999;
  brushRing.visible = false;
  brushRing.raycast = () => {}; // não captura clique nem aparece na seleção
  (brushRing.userData as Record<string, unknown>)['editorInternal'] = true; // fora da hierarquia
  three.add(brushRing);

  const terrain = createTerrainAuthoring(authoring, {
    onSculptStart: () => {
      editorState.sculptingTerrain = true;
      objectEditSystem.setGizmoVisible(false); // o gizmo roubaria o clique do pincel
    },
    onSculptStop: () => {
      editorState.sculptingTerrain = false;
      brushRing.visible = false;
      objectEditSystem.setGizmoVisible(true); // devolve o gizmo ao objeto selecionado
    },
    toast: (m) => hud.showToast(m),
  });
  // Textura do terreno via o MESMO modal com preview das estradas (padrão — ADR-0073).
  const terrainApi = {
    ...terrain.api,
    pickTexture: (obj: import('three').Object3D) =>
      texturePicker.open('Textura do terreno', terrainTextures, (url) => {
        terrain.api.setTexture(obj, url);
        refreshUI();
      }),
  };

  // Ponto do terreno sob o cursor (world), ou null se o cursor não está no terreno.
  const terrainHit = (clientX: number, clientY: number): Vector3 | null => {
    const obj = terrain.sculptObject();
    if (!obj) return null;
    const rect = game.canvas.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ndc, editorCamera);
    const hits = _ray.intersectObject(obj, true);
    return hits.length ? hits[0]!.point.clone() : null;
  };
  game.canvas.addEventListener('pointerdown', (e) => {
    if (!terrain.isSculpting() || e.button !== 0) return;
    const hit = terrainHit(e.clientX, e.clientY);
    if (!hit) return; // clique fora do terreno não pinta
    terrain.setPainting(true);
    terrain.paintAt(hit, e.shiftKey);
  });
  game.canvas.addEventListener('pointermove', (e) => {
    if (!terrain.isSculpting()) return;
    const hit = terrainHit(e.clientX, e.clientY);
    if (hit) {
      brushRing.position.copy(hit);
      brushRing.scale.setScalar(Math.max(0.1, terrain.brush().radius)); // raio em mundo
      // Cor por modo: amarelo = esculpir altura, azul = pintar textura.
      (brushRing.material as MeshBasicMaterial).color.setHex(terrain.mode() === 'paint' ? 0x4ac1ff : 0xffe24a);
      brushRing.visible = true;
    } else {
      brushRing.visible = false;
    }
    if (terrain.isPainting() && hit) terrain.paintAt(hit, e.shiftKey);
  });
  const endTerrainPaint = (): void => {
    if (terrain.isPainting()) {
      terrain.setPainting(false);
      terrain.save();
    }
  };
  game.canvas.addEventListener('pointerup', endTerrainPaint);
  game.canvas.addEventListener('pointerleave', endTerrainPaint);

  // ── Vegetação: pincel de espalhar (ADR-0077) ─────────────────────────────────
  // Raycast genérico contra os terrenos da cena (o terrainHit acima só vale na sessão
  // de esculpir). Reusa o anel do pincel (verde = espalhar, vermelho = apagar).
  const terrainMeshes = (): import('three').Object3D[] => {
    const out: import('three').Object3D[] = [];
    three.traverse((o) => { if ((o.userData as Record<string, unknown>)['cortexTerrain']) out.push(o); });
    return out;
  };
  const groundHit = (clientX: number, clientY: number): Vector3 | null => {
    const ts = terrainMeshes();
    if (!ts.length) return null;
    const rect = game.canvas.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ndc, editorCamera);
    const hits = _ray.intersectObjects(ts, true);
    return hits.length ? hits[0]!.point.clone() : null;
  };
  const vegetation = createVegetationAuthoring(authoring, {
    onPaintStart: () => {
      editorState.sculptingTerrain = true; // mesma porteira: ObjectEditSystem cede o clique
      objectEditSystem.setGizmoVisible(false);
    },
    onPaintStop: () => {
      editorState.sculptingTerrain = false;
      brushRing.visible = false;
      objectEditSystem.setGizmoVisible(true);
    },
    toast: (m) => hud.showToast(m),
    groundAt: (x, z) => {
      const ts = terrainMeshes();
      if (!ts.length) return null;
      _ray.set(new Vector3(x, 1e4, z), new Vector3(0, -1, 0));
      const hits = _ray.intersectObjects(ts, true);
      return hits.length ? hits[0]!.point.y : null;
    },
  });
  // Liga o Delete-de-instância (definido no vegHook lá em cima) à autoria de vegetação.
  deleteVegInstance = (obj, index) => vegetation.api.deleteInstance(obj, index);
  // Modal com PREVIEW (thumbnails) pra escolher o modelo da vegetação (igual estrada/terreno).
  const vegetationApi = {
    ...vegetation.api,
    pickModel: (obj: import('three').Object3D) =>
      texturePicker.open('Modelo da vegetação', vegModels, (url) => {
        vegetation.api.setModel(obj, url);
        refreshUI();
      }),
  };
  // "Adicionar Componente (Script)" estilo Unity: modal COM BUSCA listando os scripts do
  // projeto (registrados via import.meta.glob no jogo). Ícone genérico (scripts não têm thumb).
  const SCRIPT_ICON =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="10" fill="#23262f"/><text x="48" y="62" font-size="40" fill="#7fd1ff" text-anchor="middle" font-family="monospace">{ }</text></svg>',
    );
  scriptApi.pickScript = (obj) => {
    const items = scriptApi.get(obj).available.map((n) => ({ name: n, thumb: SCRIPT_ICON, value: n }));
    texturePicker.open('Adicionar Script', items, (name) => {
      scriptApi.addScript(obj, name);
      refreshUI();
    });
  };
  game.canvas.addEventListener('pointerdown', (e) => {
    if (!vegetation.isPainting() || e.button !== 0) return;
    const hit = groundHit(e.clientX, e.clientY);
    if (!hit) return;
    vegetation.setStroking(true);
    vegetation.scatterAt(hit.x, hit.z, e.shiftKey);
  });
  game.canvas.addEventListener('pointermove', (e) => {
    if (!vegetation.isPainting()) return;
    const hit = groundHit(e.clientX, e.clientY);
    if (hit) {
      brushRing.position.copy(hit);
      brushRing.scale.setScalar(Math.max(0.1, vegetation.brushRadius()));
      (brushRing.material as MeshBasicMaterial).color.setHex(e.shiftKey ? 0xff5a4a : 0x6ad06a);
      brushRing.visible = true;
    } else {
      brushRing.visible = false;
    }
    if (vegetation.isStroking() && hit) vegetation.scatterAt(hit.x, hit.z, e.shiftKey);
  });
  const endVegPaint = (): void => {
    if (vegetation.isStroking()) {
      vegetation.setStroking(false);
      vegetation.save();
    }
  };
  game.canvas.addEventListener('pointerup', endVegPaint);
  game.canvas.addEventListener('pointerleave', endVegPaint);

  // ── Animação + Ações do player: módulos de autoria (ADR-0060) ────────────────
  const animationApi = createAnimationApi(authoring);
  const shadowApi = createShadowApi(authoring);
  const playerAnimationsApi = createPlayerAnimationsApi(authoring);

  // Nós adicionados no editor (persistem em `data.added` do overlay).
  const addedList = (): SceneNode[] => {
    const a = overlay.data['added'];
    if (Array.isArray(a)) return a as SceneNode[];
    const arr: SceneNode[] = [];
    overlay.data['added'] = arr;
    return arr;
  };

  // ── Renomear objeto (ADR-0091): só nós adicionados no editor; migra as chaves
  // do overlay, com undo (CTRL+Z) e toast de feedback.
  const renameApi: RenameApi = createRenameApi(authoring, {
    isAdded: (name) => addedList().some((n) => (n as { id?: string }).id === name),
    notify: (msg) => hud.showToast(msg),
    onRenamed: (obj, oldName, newName) => {
      history.push({
        label: 'Renomear',
        undo: () => renameApi.applyRename(obj, newName, oldName),
        redo: () => renameApi.applyRename(obj, oldName, newName),
      });
    },
  });

  const inspector = createEditorInspector({
    selection,
    registry,
    colliderApi,
    physicsApi,
    vehicleApi,
    underlayApi,
    scriptApi,
    matteApi,
    materialApi,
    meshApi,
    terrainApi,
    vegetationApi,
    animationApi,
    playerAnimationsApi,
    renameApi,
    shadowApi,
    writeBack: writeBackTransform,
  });

  // ── Painel "Add": adiciona um asset .glb à cena (clique/arrasto) e persiste ──
  // Adiciona um modelo `.glb` à cena em `at` (mundo), persiste na overlay,
  // seleciona e registra no CTRL+Z. Usado pelo clique do painel Add e pelo
  // arrastar-e-soltar (painel Add / árvore de arquivos da IDE → viewport).
  const addModelNode = (url: string, at: Vector3): void => {
    const node: SceneNode = {
      type: 'model',
      id: `add-${Date.now().toString(36)}`,
      url,
      place: { x: at.x, y: at.y, z: at.z },
    };
    void addSceneNode(game.scene, node).then((obj) => {
      if (!obj) return;
      addedList().push(node);
      persist();
      selection.requestSelect(obj);
      pushAddCommand(obj, node); // CTRL+Z desfaz a adição
    });
  };
  const addPanel = createEditorAddPanel({
    onAdd: (url) => {
      // Clique: posiciona à frente da câmera do editor, no chão (y=0).
      const forward = new Vector3();
      editorCamera.getWorldDirection(forward);
      const p = editorCamera.position.clone().add(forward.multiplyScalar(12));
      p.y = 0;
      addModelNode(url, p);
    },
  });
  // ── Arrastar-e-soltar asset no viewport (ADR-0090): o drag pode nascer no
  // painel Add (standalone) ou na árvore de arquivos da IDE — DnD nativo cruza a
  // fronteira do iframe, então o drop é tratado AQUI (uma implementação só). O
  // modelo nasce onde o mouse aponta: raycast na geometria da cena (pousa na
  // plataforma/terreno sob o cursor), fallback no plano y=0.
  game.canvas.addEventListener('dragover', (e) => {
    if (!editorState.active || !isAssetDrag(e.dataTransfer?.types)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  game.canvas.addEventListener('drop', (e) => {
    if (!editorState.active) return;
    const url = assetUrlFromDataTransfer(e.dataTransfer);
    if (!url) return;
    e.preventDefault();
    const rect = game.canvas.getBoundingClientRect();
    const [nx, ny] = ndcFromClient(e.clientX, e.clientY, rect);
    const at = worldDropPoint(
      editorCamera,
      nx,
      ny,
      game.scene.getThreeScene().children,
      (hit) => !isEditorInternalHit(hit),
    );
    addModelNode(url, at);
  });
  if (typeof fetch !== 'undefined') {
    // O endpoint lista TODOS os assets (modelos + imagens): .glb vai pro painel
    // Add; imagens viram as texturas disponíveis do pincel de terreno.
    const isImage = (p: string): boolean => /\.(png|jpe?g|webp)$/i.test(p);
    fetch('/__list-assets')
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((assets) => {
        const list = Array.isArray(assets) ? assets : [];
        allModelUrls = list.filter((a) => a.toLowerCase().endsWith('.glb')).sort();
        addPanel.setAssets(allModelUrls);
        // Modelos pra vegetação: .glb de assets/vegetation/ (árvores/grama importadas).
        const vegGlb = list.filter((a) => /assets\/vegetation\/[^/]*\.glb$/i.test(a)).sort();
        vegetation.setAvailableModels(vegGlb);
        // Items do modal de modelo (thumbnail em assets/vegetation/thumbs/<nome>.png).
        const placeholderThumb = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        vegModels = [
          { name: 'Placeholder', thumb: placeholderThumb, value: '' },
          ...vegGlb.map((p) => ({
            name: (p.split('/').pop() ?? p).replace(/\.glb$/i, ''),
            thumb: p.replace(/\/([^/]*)\.glb$/i, '/thumbs/$1.png'),
            value: p,
          })),
        ];
        terrain.setAvailableTextures(list.filter(isImage));
        // Texturas do terreno pro modal (imagens; sem normal maps — não são superfícies).
        terrainTextures = list
          .filter((p) => isImage(p) && !/normal\.(png|jpe?g|webp)$/i.test(p))
          .sort()
          .map((p) => ({ name: p.split('/').pop() ?? p, thumb: p, value: p }));
      })
      .catch(() => addPanel.setAssets([]));
  }

  // ── Picker "Adicionar modelo (.glb)" (ADR-0093): modal com busca listando TODOS
  // os .glb do projeto — escolher adiciona à frente da câmera (mesmo fluxo do
  // painel Add: persiste na overlay, seleciona, CTRL+Z). Vive no frame do jogo,
  // então funciona igual no standalone e no Studio (bridge).
  const MODEL_THUMB =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="8" fill="#0e0f13"/>' +
        '<path d="M32 12 52 23v18L32 52 12 41V23z" fill="none" stroke="#7c6fff" stroke-width="2.5"/>' +
        '<path d="M12 23l20 11 20-11M32 34v18" fill="none" stroke="#7c6fff" stroke-width="2.5" opacity="0.6"/>' +
        '</svg>',
    );
  const openModelPicker = (): void => {
    const items: TextureItem<string>[] = allModelUrls.map((p) => ({
      name: p.replace(/^assets\//, '').replace(/\.glb$/i, ''),
      thumb: MODEL_THUMB,
      loadThumb: () => modelThumb(p), // render 3D em miniatura, lazy + cache
      value: p,
    }));
    texturePicker.open('Adicionar modelo (.glb)', items, (url) => {
      const forward = new Vector3();
      editorCamera.getWorldDirection(forward);
      const p = editorCamera.position.clone().add(forward.multiplyScalar(12));
      p.y = 0;
      addModelNode(url, p);
    });
  };

  // ── Blockout (ADR-0071): cria um nó `mesh`, persiste no overlay, seleciona e o
  // deixa ESTÁTICO já (via physicsApi — autoritativo: o Inspector mostra "Estático",
  // aplica o collider ao vivo e marca `cortexSolid` pra colidir com o player).
  const createMeshNode = (node: SceneNode): void => {
    void addSceneNode(game.scene, node).then((obj) => {
      if (!obj) return;
      addedList().push(node);
      // ANTES de selecionar: deixa estático (grava data.physics) pra o Inspector já
      // descrever "Estático" ao reagir à seleção (senão mostra "Nenhum" até reselecionar).
      physicsApi.setType(obj, 'static'); // nasce sólido — desligável no Inspector
      persist();
      selection.requestSelect(obj);
      pushAddCommand(obj, node); // CTRL+Z desfaz a adição
    });
  };
  const addShape = (kind: string): void => {
    if (!(kind in SHAPES)) return; // ignora kind inválido vindo da ponte
    const forward = new Vector3();
    editorCamera.getWorldDirection(forward);
    const p = editorCamera.position.clone().add(forward.multiplyScalar(12));
    createMeshNode({
      type: 'mesh',
      id: `mesh-${Date.now().toString(36)}`,
      shape: { kind: kind as ShapeKind },
      place: { x: p.x, z: p.z, y: 0 },
    });
  };

  // Limpeza completa ao DELETAR um nó (preenche o hook usado pelo ObjectEditSystem):
  // 1) destrói entidades de física vivas (collider/character/rapier) → some o gizmo
  //    de collider (senão fica "fantasma" na cena); 2) nó ADICIONADO no editor sai de
  //    `data.added` de vez (não faz sentido marcar "deletado" — não há base pra pular,
  //    nem undo); nó BASE (level.json) entra em `data.deleted` pro buildScene pular;
  //    3) limpa as entradas de overlay por-objeto (transform + concerns).
  // Chaves de overlay por-objeto (concerns) — limpas no delete, capturadas/restauradas no undo.
  const CONCERN_KEYS = ['physics', 'colliders', 'material', 'matte', 'geometry', 'animation', 'playerAnimations', 'terrain', 'terrainPaint', 'vehicle', 'underlay', 'scripts'] as const;
  const cloneJson = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

  /** Snapshot de TUDO de um nó (transform + concerns + def se foi criado no editor) — pro undo. */
  interface NodeSnapshot {
    transform?: SceneFileV1['objects'][string];
    concerns: Record<string, unknown>;
    addedNode?: SceneNode; // presente se o nó veio de `data.added` (criado no editor)
  }
  const snapshotNode = (name: string): NodeSnapshot => {
    const concerns: Record<string, unknown> = {};
    for (const key of CONCERN_KEYS) {
      const m = (overlay.data as Record<string, unknown>)[key];
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        const v = (m as Record<string, unknown>)[name];
        if (v !== undefined) concerns[key] = cloneJson(v);
      }
    }
    const added = addedList().find((n) => (n as { id?: string }).id === name);
    return {
      transform: overlay.objects[name] ? { ...overlay.objects[name] } : undefined,
      concerns,
      addedNode: added ? cloneJson(added) : undefined,
    };
  };

  /** Limpeza pura ao deletar (sem registrar undo nem remover da cena — o chamador remove). */
  const deleteNodeCleanup = (obj: Object3D, name: string): void => {
    physicsApi.setType(obj, 'none'); // destrói collider/character/rapier + tira cortexSolid
    const added = addedList();
    const i = added.findIndex((n) => (n as { id?: string }).id === name);
    if (i >= 0) added.splice(i, 1); // criado no editor → some de vez
    else {
      const d = deletedList(); // nó do level.json → marca pra pular no boot
      if (!d.includes(name)) d.push(name);
    }
    delete overlay.objects[name];
    for (const key of CONCERN_KEYS) {
      const m = (overlay.data as Record<string, unknown>)[key];
      if (m && typeof m === 'object' && !Array.isArray(m)) delete (m as Record<string, unknown>)[name];
    }
    persist(true);
  };

  /** Restaura um nó deletado/adicionado-desfeito: re-anexa o MESMO Object3D + overlay + física viva. */
  const restoreNode = (obj: Object3D, name: string, snap: NodeSnapshot): void => {
    three.add(obj); // o obj fica vivo (só desanexado) — re-anexar traz de volta visual/geometria
    if (snap.transform) overlay.objects[name] = { ...snap.transform };
    if (snap.addedNode) {
      const a = addedList();
      if (!a.some((n) => (n as { id?: string }).id === name)) a.push(cloneJson(snap.addedNode));
    } else {
      const d = deletedList();
      const di = d.indexOf(name);
      if (di >= 0) d.splice(di, 1); // nó base volta a aparecer no boot
    }
    for (const key of CONCERN_KEYS) {
      const m = ((overlay.data as Record<string, unknown>)[key] ??= {}) as Record<string, unknown>;
      if (snap.concerns[key] !== undefined) m[name] = cloneJson(snap.concerns[key]);
      else delete m[name];
    }
    // Recria o corpo físico vivo a partir do tipo salvo (params exatos voltam no reload via overlay).
    const phys = snap.concerns['physics'] as { type?: string } | undefined;
    if (phys?.type && phys.type !== 'none') {
      physicsApi.setType(obj, phys.type as 'static' | 'character' | 'rigid');
      overlay.data['physics'] = (overlay.data['physics'] ?? {}) as Record<string, unknown>;
      (overlay.data['physics'] as Record<string, unknown>)[name] = cloneJson(phys); // setType pode ter sobrescrito
    }
    persist(true);
    selection.requestSelect(obj);
  };

  deleteNode = (obj) => {
    if (!obj.name) return;
    const name = obj.name;
    const snap = snapshotNode(name); // captura ANTES de limpar
    deleteNodeCleanup(obj, name);
    history.push({
      label: 'Deletar',
      undo: () => restoreNode(obj, name, snap),
      redo: () => {
        selection.requestSelect(null);
        obj.parent?.remove(obj);
        deleteNodeCleanup(obj, name);
      },
    });
  };

  /** Registra o undo de ADICIONAR um nó (desfazer remove; refazer re-anexa o mesmo obj). */
  const pushAddCommand = (obj: Object3D, node: SceneNode): void => {
    const name = (node as { id?: string }).id;
    if (!name) return;
    let snap: NodeSnapshot | null = null;
    history.push({
      label: `Adicionar ${node.type}`,
      undo: () => {
        snap = snapshotNode(name); // estado atual (inclui edições feitas após adicionar)
        selection.requestSelect(null);
        obj.parent?.remove(obj);
        deleteNodeCleanup(obj, name);
      },
      redo: () => {
        if (snap) restoreNode(obj, name, snap);
      },
    });
  };
  const shapeDrawSystem = new ShapeDrawSystem(
    editorState,
    editorCamera,
    game.canvas,
    game.scene,
    game.input,
    hud,
    createMeshNode,
  );
  game.world.addSystem(shapeDrawSystem);


  // Vegetação (ADR-0077): cria o nó `vegetation` (placeholder) e JÁ liga o pincel de
  // espalhar — o usuário clica/arrasta no terreno pra povoar.
  const createVegetationNode = (): void => {
    // Default: um .glb real de árvore (cai no placeholder se o asset faltar). O modelo
    // (árvore/arbusto/futura grama) se troca no Inspector pelo modal com preview.
    const node = { type: 'vegetation' as const, id: `veg-${Date.now().toString(36)}`, kind: 'tree' as const, model: 'assets/vegetation/scotspine-a.glb', instances: [] };
    void addSceneNode(game.scene, node).then((obj) => {
      if (!obj) return;
      addedList().push(node);
      persist();
      selection.requestSelect(obj);
      vegetation.api.startPaint(obj);
      pushAddCommand(obj, node); // CTRL+Z desfaz a adição
    });
  };

  // ── "Desenhar blockout" (ADR-0093): escolhe O QUE o desenho cria — a caixa
  // paramétrica (padrão) ou um .glb que SE MOLDA à caixa desenhada (o preview do
  // próprio modelo escala ao vivo durante o arrasto; ver ShapeDrawSystem.setModel).
  const openDrawBlockoutPicker = (): void => {
    const items: TextureItem<string>[] = [
      { name: 'Caixa (padrão)', thumb: MODEL_THUMB, value: '' },
      ...allModelUrls.map((p) => ({
        name: p.replace(/^assets\//, '').replace(/\.glb$/i, ''),
        thumb: MODEL_THUMB,
        loadThumb: () => modelThumb(p),
        value: p,
      })),
    ];
    texturePicker.open('Desenhar blockout — escolha a peça', items, (url) => {
      shapeDrawSystem.setModel(url === '' ? null : url);
      shapeDrawSystem.setArmed(true); // mesmo gesto: CTRL+arraste base → altura → clique
    });
  };

  const shapePanel = createEditorShapePanel({
    onPickModel: openModelPicker,
    onAddShape: addShape,
    onDrawBox: openDrawBlockoutPicker,
    onAddVegetation: createVegetationNode,
  });

  // ── Ponte com a IDE (ADR-0056) ───────────────────────────────────────────────
  // Se o jogo roda dentro do iframe do Preview da IDE, publica hierarquia/inspector
  // como CHROME da IDE (estilo Blender) e esconde os painéis in-canvas. O gizmo, a
  // câmera livre e o desenho de heightfield continuam no viewport. Fora da IDE
  // (browser standalone, `?play`) a ponte fica inerte e os painéis in-canvas valem.
  let bridgedPanelsHidden = false;

  // ── Info do viewport pra IDE (pills flutuantes: câmera/perf/seleção/ferramenta) ─
  let fps = 60;
  let fpsFrames = 0;
  let fpsSince = typeof performance !== 'undefined' ? performance.now() : 0;
  const countViewport = (): { objects: number; lights: number } => {
    let objects = 0;
    let lights = 0;
    for (const c of three.children) {
      if (c.userData?.['editorInternal'] === true) continue;
      objects++;
      if ((c as unknown as { isLight?: boolean }).isLight) lights++;
    }
    return { objects, lights };
  };
  const viewportInfo = (): Record<string, unknown> => {
    const { objects, lights } = countViewport();
    return {
      camera: hud.coords.textContent ?? '',
      fps,
      objects,
      lights,
      selected: selection.current?.name ?? null,
      gizmo: objectEditSystem.gizmoMode,
    };
  };

  // Cria um terreno à frente da câmera (menu "Adicionar terreno" da IDE) e o
  // persiste no overlay (added) — igual ao add de asset. Seleciona pra já esculpir.
  const addTerrain = (): void => {
    const forward = new Vector3();
    editorCamera.getWorldDirection(forward);
    const p = editorCamera.position.clone().add(forward.multiplyScalar(20));
    const node: SceneNode = {
      type: 'terrain',
      id: `terrain-${Date.now().toString(36)}`,
      // Grande e com bastante resolução pra não precisar ESCALAR (escalar deixa a
      // grade grossa → sculpt pontudo). 128 unidades, ~1u por face.
      size: 128,
      resolution: 128,
      transform: { position: [p.x, 0, p.z] },
    };
    void addSceneNode(game.scene, node).then((obj) => {
      if (!obj) return;
      addedList().push(node);
      // Cria a entidade ECS do terreno + liga a colisão JÁ (addSceneNode só faz o
      // mesh; sem isso o terreno não era sólido até recarregar). Sólido por padrão.
      const terrain = (obj.userData as Record<string, unknown>)['cortexTerrain'] as Terrain | undefined;
      if (terrain) {
        const e = game.world.createEntity();
        e.addComponent(new TerrainComponent(terrain, obj));
        if (!game.world.hasSystem(TerrainCollisionSystem)) game.world.addSystem(new TerrainCollisionSystem());
      }
      persist();
      selection.requestSelect(obj);
      pushAddCommand(obj, node); // CTRL+Z desfaz a adição
      hud.showToast('Terreno adicionado (sólido) — clique "Esculpir" no inspector');
    });
  };

  const bridge = createEditorBridge({
    editRoots: [three],
    selection,
    registry,
    editorState,
    ctx: { colliderApi, physicsApi, vehicleApi, underlayApi, scriptApi, matteApi, materialApi, meshApi, terrainApi, vegetationApi, animationApi, playerAnimationsApi, renameApi, shadowApi, writeBack: writeBackTransform },
    focusOn: (obj) => cameraSystem.focusOn(obj),
    viewportInfo,
    onTool: (mode) => objectEditSystem.setGizmoMode(mode),
    onAddTerrain: addTerrain,
    onAddShape: addShape,
    onDrawShape: openDrawBlockoutPicker,
    onAddVegetation: createVegetationNode,
    onOpenModelPicker: openModelPicker,
    // Drop de asset vindo da IDE (overlay sobre o iframe — o Electron não entrega
    // DnD nativo pra dentro do iframe): nx/ny normalizados (0..1) → NDC → mesmo
    // fluxo do drop in-canvas (raycast na geometria sob o cursor).
    onDropAsset: (url, nx, ny) => {
      if (!editorState.active) return;
      const at = worldDropPoint(
        editorCamera,
        nx * 2 - 1,
        -(ny * 2 - 1),
        game.scene.getThreeScene().children,
        (hit) => !isEditorInternalHit(hit),
      );
      addModelNode(url, at);
    },
    onBridged: () => {
      bridgedPanelsHidden = true;
      outliner.setVisible(false);
      inspector.setVisible(false);
      addPanel.setVisible(false);
      shapePanel.setVisible(false);
      hud.setVisible(false); // a barra de HUD vira pills da IDE
      if (playBtn) playBtn.style.display = 'none';
    },
  });

  // Atualiza os dois renderizadores do inspector (in-canvas + IDE) após uma edição
  // assíncrona fora dos handlers (ex.: escolher textura no modal de superfície).
  refreshUI = (): void => {
    inspector.refresh();
    bridge.publish();
  };

  let wasActive = false;
  let savedFog: import('three').Scene['fog'] = null; // névoa real (off no editor, on no play)
  let lastChildren = new Set<Object3D>();
  let lastSelected: Object3D | null = null;
  let lastEdit: SavedTransform | null = null;

  const snapshot = (): void => {
    lastChildren = new Set(three.children);
  };
  const sceneChanged = (): boolean => {
    const cur = three.children;
    if (cur.length !== lastChildren.size) return true;
    for (const c of cur) if (!lastChildren.has(c)) return true;
    return false;
  };

  // Auto-save: detecta mudança de transform do selecionado (gizmo ou inspector).
  const autosaveSelected = (): void => {
    const cur = selection.current;
    if (cur !== lastSelected) {
      lastSelected = cur;
      lastEdit = cur && cur.name ? transformOf(cur) : null;
      return;
    }
    if (!cur || !cur.name) return;
    const e = transformOf(cur);
    if (lastEdit && sameTransform(e, lastEdit)) return;
    overlay.objects[cur.name] = e;
    const d = deletedList();
    const i = d.indexOf(cur.name);
    if (i >= 0) d.splice(i, 1);
    lastEdit = e;
    persist();
  };

  return {
    activeCamera: () => (editorState.active ? editorCamera : null),
    isActive: () => editorState.active,
    isPaused: () => editorState.paused,
    update(): void {
      // FPS médio (~a cada 500ms) pra a pill de perf do viewport.
      if (typeof performance !== 'undefined') {
        fpsFrames++;
        const now = performance.now();
        if (now - fpsSince >= 500) {
          fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
          fpsFrames = 0;
          fpsSince = now;
        }
      }
      // Bridged (dentro da IDE): os painéis viram chrome da IDE — não mostramos os
      // in-canvas. Em ambos os casos o gizmo/câmera/helpers ficam no viewport.
      const showInCanvas = !bridgedPanelsHidden;
      // Névoa: OFF no editor (vê a cena inteira), ON no play. Captura a névoa real assim
      // que o buildScene a define (mesmo bootando em edição), depois alterna por modo.
      const scene3 = game.scene.getThreeScene();
      if (scene3.fog) savedFog = scene3.fog;
      scene3.fog = editorState.active ? null : savedFog;
      if (editorState.active !== wasActive) {
        wasActive = editorState.active;
        // Trocar de modo zera o pause (entra em play já rodando; volta pro editor
        // sem estado de pause pendente).
        editorState.paused = false;
        if (terrain.isSculpting()) terrainApi.stopSculpt(); // sai do pincel ao trocar de modo
        // Restaura a visibilidade dos characters ao ABRIR o editor: o occlusion
        // fade da câmera 3ª pessoa pode ter ocultado o player no instante da
        // pausa (o sistema pausado não roda pra restaurar sozinho).
        if (editorState.active) {
          for (const e of game.world.query(CharacterBodyComponent)) {
            const o = e.getComponent(Object3DComponent)?.object;
            if (o) o.visible = true;
          }
        }
        // Play (edit→play) snapshota o mundo; Stop (play→edit) restaura — Play
        // não destrói o estado de edição.
        if (editorState.active) restoreWorld();
        else snapshotWorld();
        updatePlayBtn();
        hud.setVisible(showInCanvas && editorState.active);
        outliner.setVisible(showInCanvas && editorState.active);
        inspector.setVisible(showInCanvas && editorState.active);
        addPanel.setVisible(showInCanvas && editorState.active);
        shapePanel.setVisible(showInCanvas && editorState.active);
        // Frustum da câmera + helpers de luz: só no modo edição (somem no Play).
        cameraHelper.visible = editorState.active;
        if (editorState.active) cameraHelper.update();
        syncLightHelpers(editorState.active);
        // Underlay (imagem de referência): aid de edição — some no Play.
        scene3.traverse((o) => {
          if ((o.userData as Record<string, unknown>)['cortexUnderlay']) o.visible = editorState.active;
        });
        if (editorState.active) {
          if (showInCanvas) outliner.refresh();
          snapshot();
        }
      }
      if (editorState.active) {
        // Esculpir é "preso" ao terreno selecionado: trocar de seleção sai do pincel.
        if (terrain.isSculpting() && selection.current !== terrain.sculptObject()) terrainApi.stopSculpt();
        if (sceneChanged()) {
          if (showInCanvas) outliner.refresh();
          snapshot();
          syncLightHelpers(true); // pega luzes adicionadas async (buildScene)
        }
        if (showInCanvas) inspector.refresh();
        autosaveSelected();
      }
      // Publica pra IDE (no-op fora dela). Roda também em Play, pra os painéis da
      // IDE refletirem o estado ao vivo — resolve "preciso dar play pra ver".
      bridge.publish();
    },
  };
}
