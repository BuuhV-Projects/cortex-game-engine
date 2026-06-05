import { PerspectiveCamera, type Object3D } from 'three';
import type { Game, GameEditor } from '../core/Game.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { EditableTargetComponent } from '../components/EditableTargetComponent.js';
import { createEditorState } from './EditorState.js';
import { createEditorSelection } from './EditorSelection.js';
import { createEditorHud } from './EditorHud.js';
import { createEditorOutliner } from './EditorOutliner.js';
import { createEditorInspector } from './EditorInspector.js';
import { EditorCameraSystem } from './EditorCameraSystem.js';
import { ObjectEditSystem } from './ObjectEditSystem.js';
import { SceneLoader } from '../scene/SceneLoader.js';
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
  const hud = createEditorHud();

  const editorCamera = new PerspectiveCamera(60, game.camera.aspect, 0.1, 2000);
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

  game.world.addSystem(
    new ObjectEditSystem(
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
      undefined, // onTransformChange (autosave cuida disso por frame)
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
    ),
  );

  const outliner = createEditorOutliner({ editRoots: [three], selection, onFocus: (obj) => cameraSystem.focusOn(obj) });
  const inspector = createEditorInspector({ selection });

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
    update(): void {
      if (editorState.active !== wasActive) {
        wasActive = editorState.active;
        hud.setVisible(editorState.active);
        outliner.setVisible(editorState.active);
        inspector.setVisible(editorState.active);
        if (editorState.active) {
          outliner.refresh();
          snapshot();
        }
      }
      if (editorState.active) {
        if (sceneChanged()) {
          outliner.refresh();
          snapshot();
        }
        inspector.refresh();
        autosaveSelected();
      }
    },
  };
}
