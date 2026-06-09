import {
  PerspectiveCamera,
  Vector3,
  Vector2,
  Box3,
  Plane,
  Raycaster,
  CameraHelper,
  DirectionalLight,
  HemisphereLight,
  PointLight,
  SpotLight,
  DirectionalLightHelper,
  HemisphereLightHelper,
  PointLightHelper,
  SpotLightHelper,
  type Object3D,
} from 'three';
import type { Game, GameEditor } from '../core/Game.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { EditableTargetComponent } from '../components/EditableTargetComponent.js';
import type { Entity } from '../ecs/Entity.js';
import { createEditorState } from './EditorState.js';
import { createEditorSelection } from './EditorSelection.js';
import { createEditorHud } from './EditorHud.js';
import { createEditorOutliner } from './EditorOutliner.js';
import {
  createEditorInspector,
  type ColliderApi,
  type MatteApi,
  type MaterialApi,
  type AnimationApi,
  type PlayerAnimationsApi,
} from './EditorInspector.js';
import { setMatte, clearMatte, isMatte } from '../scene/SceneAssets.js';
import { applyMaterial, type MaterialConfig } from '../scene/Materials.js';
import type { SceneAnimator } from '../scene/SceneAnimator.js';
import { PlayerAnimatorComponent } from '../components/PlayerAnimatorComponent.js';
import { autoMapPlayerClips } from '../systems/PlatformerAnimationSystem.js';
import { createEditorAddPanel } from './EditorAddPanel.js';
import { createObjectRegistry } from './EditorModel.js';
import { createEditorBridge } from './EditorBridge.js';
import { EditorCameraSystem } from './EditorCameraSystem.js';
import { ObjectEditSystem } from './ObjectEditSystem.js';
import { ColliderGizmoSystem } from './ColliderGizmoSystem.js';
import { SceneLoader } from '../scene/SceneLoader.js';
import { addSceneNode } from '../scene/SceneBuilder.js';
import type { SceneNode } from '../scene/SceneDefinition.js';
import { emptySceneFile, type SceneFileV1 } from '../scene/SceneFile.js';
import { autoDetectSceneFileWriter } from '../io/autoDetectSceneFileWriter.js';

/** Caminho do overlay — pareia com `createSceneSavePlugin` (target default). */
const OVERLAY_PATH = 'assets/scene-data.json';

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
 * (`SceneFileV1` em `assets/scene-data.json`) via `autoDetectSceneFileWriter`
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
  const editorCamera = new PerspectiveCamera(60, aspect0, 0.1, 2000);
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

  // ── Overlay de persistência ──────────────────────────────────────────────────
  const overlay: SceneFileV1 = emptySceneFile();
  const deletedList = (): string[] => {
    const d = overlay.data['deleted'];
    if (Array.isArray(d)) return d as string[];
    const arr: string[] = [];
    overlay.data['deleted'] = arr;
    return arr;
  };
  const writer = autoDetectSceneFileWriter();
  // Semeia com a overlay já existente, pra não sobrescrever edições anteriores.
  void new SceneLoader()
    .loadSceneFile(OVERLAY_PATH)
    .then((f) => {
      if (f) {
        overlay.objects = f.objects;
        overlay.data = f.data;
      }
    })
    .catch(() => {});

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = (immediate = false): void => {
    if (!writer) return;
    if (immediate) {
      void writer.save(overlay).catch(() => {});
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void writer.save(overlay).catch(() => {});
    }, 500);
  };

  // Write-back do transform pro ECS: editar via gizmo OU inspector escreve no
  // TransformComponent — senão o Object3DSyncSystem sobrescreve no próximo tick
  // (posição + rotação Y; rotX/Z e escala ficam no Object3D, que o sync não toca).
  const writeBackTransform = (obj: Object3D): void => {
    for (const e of game.world.query(Object3DComponent)) {
      if (e.getComponent(Object3DComponent)!.object !== obj) continue;
      const t = e.getComponent(TransformComponent);
      if (t) {
        t.x = obj.position.x;
        t.y = obj.position.y;
        t.z = obj.position.z;
        t.rotationY = obj.rotation.y;
      }
      break;
    }
  };

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
      (obj) => {
        // onDelete (Delete) — persiste a remoção no overlay (loader pula no boot).
        if (!obj.name) return;
        const d = deletedList();
        if (!d.includes(obj.name)) d.push(obj.name);
        delete overlay.objects[obj.name];
        persist();
      },
      // Edição com TODOS os eixos livres (mover/rotacionar/escalar em X/Y/Z) +
      // snap de grade. Embora a gameplay seja 2.5D (plano XY), o editor é 3D pleno
      // — útil pra profundidade/parallax em Z e decoração. As edições persistem:
      // posição e rotY pelo write-back no Transform; rotX/Z e escala ficam no
      // Object3D (o Object3DSyncSystem não as sobrescreve).
      { snap: 0.5 },
  );
  game.world.addSystem(objectEditSystem);

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
  // direção (Directional), hemisfério (Hemisphere), esfera (Point), cone (Spot).
  // Sem isso, clicar numa luz dá só os eixos do gizmo num ponto invisível. Ambient
  // não tem helper (é global). Ressincronizado quando a cena muda (as luzes
  // carregam async pelo buildScene).
  type LightHelper = Object3D & { update?(): void; dispose?(): void };
  const lightHelpers = new Map<Object3D, LightHelper>();
  const syncLightHelpers = (visible: boolean): void => {
    const present = new Set<Object3D>();
    three.traverse((o) => {
      const make =
        o instanceof DirectionalLight
          ? (): LightHelper => new DirectionalLightHelper(o, 2)
          : o instanceof HemisphereLight
            ? (): LightHelper => new HemisphereLightHelper(o, 1)
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
      entity.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z));
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
  const colliderApi: ColliderApi = {
    get(obj) {
      const e = findColliderEntity(obj);
      if (!e) return null;
      const c = e.getComponent(Collider2DComponent)!;
      // locked = veio do código (não está na overlay editável).
      const locked = !(obj.name && collidersMap()[obj.name]);
      return {
        shape: c.shape,
        width: c.halfWidth * 2,
        height: c.halfHeight * 2,
        offsetX: c.offsetX,
        offsetY: c.offsetY,
        solid: c.solid,
        oneWay: c.oneWay,
        pointCount: c.points?.length ?? 0,
        locked,
      };
    },
    add(obj) {
      if (!obj.name || findColliderEntity(obj)) return;
      const box = new Box3().setFromObject(obj);
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const width = Math.max(size.x, 0.1);
      const height = Math.max(size.y, 0.1);
      const offX = center.x - obj.position.x;
      const offY = center.y - obj.position.y;
      const e = game.world.createEntity();
      e.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z));
      e.addComponent(new Object3DComponent(obj));
      e.addComponent(new Collider2DComponent(width / 2, height / 2, true, false, offX, offY, 'box'));
      collidersMap()[obj.name] = { shape: 'box', width, height, offsetX: offX, offsetY: offY, solid: true, oneWay: false };
      persist();
    },
    update(obj, patch) {
      const e = findColliderEntity(obj);
      if (!e || !obj.name) return;
      const c = e.getComponent(Collider2DComponent)!;
      if (patch.width !== undefined) c.halfWidth = patch.width / 2;
      if (patch.height !== undefined) c.halfHeight = patch.height / 2;
      if (patch.offsetX !== undefined) c.offsetX = patch.offsetX;
      if (patch.offsetY !== undefined) c.offsetY = patch.offsetY;
      if (patch.solid !== undefined) c.solid = patch.solid;
      if (patch.oneWay !== undefined) c.oneWay = patch.oneWay;
      if (patch.shape !== undefined) c.shape = patch.shape;
      collidersMap()[obj.name] = {
        shape: c.shape,
        width: c.halfWidth * 2,
        height: c.halfHeight * 2,
        offsetX: c.offsetX,
        offsetY: c.offsetY,
        solid: c.solid,
        oneWay: c.oneWay,
      };
      persist();
    },
    remove(obj) {
      const e = findColliderEntity(obj);
      if (e) game.world.destroyEntity(e);
      if (obj.name) delete collidersMap()[obj.name];
      persist();
    },
    startHeightfield(obj) {
      startDraw(obj);
    },
    autoHeightfield(obj) {
      autoTraceHeightfield(obj);
    },
  };
  // ── Fosco (matte) como propriedade autorável ────────────────────────────────
  // Persiste em `overlay.data.matte[nome]` (true/false explícito — `false`
  // sobrescreve um matte do código); o `buildScene` reaplica no boot.
  const matteMap = (): Record<string, boolean> => {
    const m = overlay.data['matte'];
    if (m && typeof m === 'object' && !Array.isArray(m)) return m as Record<string, boolean>;
    const obj: Record<string, boolean> = {};
    overlay.data['matte'] = obj;
    return obj;
  };
  const matteApi: MatteApi = {
    get: (obj) => isMatte(obj),
    set: (obj, v) => {
      if (v) setMatte(obj);
      else clearMatte(obj);
      if (obj.name) matteMap()[obj.name] = v;
      persist();
    },
  };

  // ── Material/shader como propriedade autorável (ADR-0058) ────────────────────
  // Persiste a MaterialConfig em `overlay.data.material[nome]`; o buildScene
  // reaplica no boot (overlay > nó JSON). `standard` remove a autoria.
  const materialMap = (): Record<string, MaterialConfig> => {
    const m = overlay.data['material'];
    if (m && typeof m === 'object' && !Array.isArray(m)) return m as Record<string, MaterialConfig>;
    const o: Record<string, MaterialConfig> = {};
    overlay.data['material'] = o;
    return o;
  };
  const materialApi: MaterialApi = {
    get: (obj) => (obj.name ? (materialMap()[obj.name] ?? null) : null),
    set: (obj, config) => {
      applyMaterial(obj, config);
      if (obj.name) {
        if (config.type === 'standard') delete materialMap()[obj.name];
        else materialMap()[obj.name] = config;
      }
      persist();
    },
  };

  // ── Animação (escolher clipe + play/stop + loop/velocidade), persistida ──────
  // Lê o SceneAnimator de `userData.cortexAnim` (criado pelo buildScene) e grava em
  // `overlay.data.animation[id]` — o buildScene reaplica no boot (overlay > nó JSON).
  type AnimSave = { clip?: string; loop?: boolean; speed?: number; autoplay?: boolean };
  const animMap = (): Record<string, AnimSave> => {
    const m = overlay.data['animation'];
    if (m && typeof m === 'object' && !Array.isArray(m)) return m as Record<string, AnimSave>;
    const o: Record<string, AnimSave> = {};
    overlay.data['animation'] = o;
    return o;
  };
  const getAnimator = (obj: Object3D): SceneAnimator | undefined =>
    (obj.userData as Record<string, unknown>)['cortexAnim'] as SceneAnimator | undefined;
  const animationApi: AnimationApi = {
    get(obj) {
      const an = getAnimator(obj);
      if (!an) return null;
      const saved = obj.name ? animMap()[obj.name] : undefined;
      return { clips: an.clipNames(), current: an.current, loop: saved?.loop ?? true, speed: saved?.speed ?? 1 };
    },
    play(obj, clip) {
      const an = getAnimator(obj);
      if (!an) return;
      const saved = (obj.name && animMap()[obj.name]) || {};
      const loop = saved.loop ?? true;
      const speed = saved.speed ?? 1;
      an.play(clip, { loop, speed });
      if (obj.name) {
        animMap()[obj.name] = { clip, loop, speed, autoplay: true };
        persist();
      }
    },
    stop(obj) {
      const an = getAnimator(obj);
      if (!an) return;
      an.stop();
      if (obj.name) {
        animMap()[obj.name] = { ...(animMap()[obj.name] ?? {}), autoplay: false };
        persist();
      }
    },
    setLoop(obj, loop) {
      const an = getAnimator(obj);
      if (!an) return;
      const saved = (obj.name && animMap()[obj.name]) || {};
      const clip = an.current ?? saved.clip ?? an.clipNames()[0];
      const speed = saved.speed ?? 1;
      if (clip) an.play(clip, { loop, speed });
      if (obj.name) {
        animMap()[obj.name] = { clip, loop, speed, autoplay: an.current != null };
        persist();
      }
    },
    setSpeed(obj, speed) {
      const an = getAnimator(obj);
      if (!an) return;
      an.setSpeed(speed);
      if (obj.name) {
        animMap()[obj.name] = { ...(animMap()[obj.name] ?? {}), speed };
        persist();
      }
    },
  };

  // ── Ações do player (mapa ação→clipe), persistido ───────────────────────────
  // Lê/grava o PlayerAnimatorComponent da entidade do objeto + overlay
  // (`data.playerAnimations[id]`); o buildScene reaplica no boot (overlay > nó).
  const PLAYER_ACTIONS = ['idle', 'walk', 'run', 'jump', 'fall', 'land'];
  const findPlayerAnim = (obj: Object3D): PlayerAnimatorComponent | null => {
    for (const e of game.world.query(PlayerAnimatorComponent)) {
      if (e.getComponent(Object3DComponent)?.object === obj) return e.getComponent(PlayerAnimatorComponent) ?? null;
    }
    return null;
  };
  const playerAnimMap = (): Record<string, Record<string, string>> => {
    const m = overlay.data['playerAnimations'];
    if (m && typeof m === 'object' && !Array.isArray(m)) return m as Record<string, Record<string, string>>;
    const o: Record<string, Record<string, string>> = {};
    overlay.data['playerAnimations'] = o;
    return o;
  };
  const playerAnimationsApi: PlayerAnimationsApi = {
    get(obj) {
      const comp = findPlayerAnim(obj);
      const animator = getAnimator(obj);
      if (!comp || !animator) return null;
      return { actions: PLAYER_ACTIONS, clips: animator.clipNames(), map: { ...comp.clips } };
    },
    set(obj, action, clip) {
      const comp = findPlayerAnim(obj);
      if (!comp) return;
      if (clip) comp.clips[action] = clip;
      else delete comp.clips[action];
      comp.current = null; // re-avalia a ação no próximo Play
      if (obj.name) {
        const cur = playerAnimMap()[obj.name] ?? {};
        if (clip) cur[action] = clip;
        else delete cur[action];
        playerAnimMap()[obj.name] = cur;
        persist();
      }
    },
    preview(obj, clip) {
      const an = getAnimator(obj);
      if (an && clip) an.play(clip, { loop: true });
    },
    stop(obj) {
      getAnimator(obj)?.stop();
    },
    autoMap(obj) {
      const comp = findPlayerAnim(obj);
      const an = getAnimator(obj);
      if (!comp || !an) return;
      // Infere pelos nomes (explícito vence) e GRAVA — materializa a inferência.
      comp.clips = autoMapPlayerClips(an.clipNames(), comp.clips);
      if (obj.name) {
        playerAnimMap()[obj.name] = { ...comp.clips };
        persist();
      }
    },
  };

  const inspector = createEditorInspector({
    selection,
    registry,
    colliderApi,
    matteApi,
    materialApi,
    animationApi,
    playerAnimationsApi,
    writeBack: writeBackTransform,
  });

  // ── Painel "Add": adiciona um asset .glb à cena (clique) e persiste no overlay ─
  const addedList = (): SceneNode[] => {
    const a = overlay.data['added'];
    if (Array.isArray(a)) return a as SceneNode[];
    const arr: SceneNode[] = [];
    overlay.data['added'] = arr;
    return arr;
  };
  const addPanel = createEditorAddPanel({
    onAdd: (url) => {
      // Posiciona à frente da câmera do editor, no chão (y=0), e seleciona pra mover.
      const forward = new Vector3();
      editorCamera.getWorldDirection(forward);
      const p = editorCamera.position.clone().add(forward.multiplyScalar(12));
      const node: SceneNode = {
        type: 'model',
        id: `add-${Date.now().toString(36)}`,
        url,
        place: { x: p.x, z: p.z, y: 0 },
      };
      void addSceneNode(game.scene, node).then((obj) => {
        if (!obj) return;
        addedList().push(node);
        persist();
        selection.requestSelect(obj);
      });
    },
  });
  if (typeof fetch !== 'undefined') {
    fetch('/__list-assets')
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((assets) => addPanel.setAssets(Array.isArray(assets) ? assets : []))
      .catch(() => addPanel.setAssets([]));
  }

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

  const bridge = createEditorBridge({
    editRoots: [three],
    selection,
    registry,
    editorState,
    ctx: { colliderApi, matteApi, materialApi, animationApi, playerAnimationsApi, writeBack: writeBackTransform },
    focusOn: (obj) => cameraSystem.focusOn(obj),
    viewportInfo,
    onTool: (mode) => objectEditSystem.setGizmoMode(mode),
    onBridged: () => {
      bridgedPanelsHidden = true;
      outliner.setVisible(false);
      inspector.setVisible(false);
      addPanel.setVisible(false);
      hud.setVisible(false); // a barra de HUD vira pills da IDE
      if (playBtn) playBtn.style.display = 'none';
    },
  });

  let wasActive = false;
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
      if (editorState.active !== wasActive) {
        wasActive = editorState.active;
        // Trocar de modo zera o pause (entra em play já rodando; volta pro editor
        // sem estado de pause pendente).
        editorState.paused = false;
        // Play (edit→play) snapshota o mundo; Stop (play→edit) restaura — Play
        // não destrói o estado de edição.
        if (editorState.active) restoreWorld();
        else snapshotWorld();
        updatePlayBtn();
        hud.setVisible(showInCanvas && editorState.active);
        outliner.setVisible(showInCanvas && editorState.active);
        inspector.setVisible(showInCanvas && editorState.active);
        addPanel.setVisible(showInCanvas && editorState.active);
        // Frustum da câmera + helpers de luz: só no modo edição (somem no Play).
        cameraHelper.visible = editorState.active;
        if (editorState.active) cameraHelper.update();
        syncLightHelpers(editorState.active);
        if (editorState.active) {
          if (showInCanvas) outliner.refresh();
          snapshot();
        }
      }
      if (editorState.active) {
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
