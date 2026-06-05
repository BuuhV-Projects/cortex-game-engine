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

/**
 * Liga o **modo editor completo** a um {@link Game}: câmera de voo livre (F2),
 * gizmo, HUD, hierarquia e inspector, com reatividade nos dois sentidos. É
 * registrado automaticamente pelo bundle de desenvolvimento do engine
 * (`index.dev.js`) via `registerEditorAttacher`, então o jogo não escreve nada —
 * em produção o editor não está no bundle (ver ADR-0042).
 *
 * Reatividade:
 * - **editor → cena**: gizmo e inspector escrevem direto nos objetos.
 * - **cena → editor**: a cada frame (com o editor ativo) faz diff dos filhos da
 *   cena (hierarquia se atualiza quando algo entra/sai) e relê a transform do
 *   selecionado (inspector ao vivo), sem pisar no campo em foco.
 *
 * @param game - O jogo ao qual anexar o editor.
 * @returns O {@link GameEditor} que o Game consulta a cada frame.
 */
export function attachEditor(game: Game): GameEditor {
  const three = game.scene.getThreeScene();
  const editorState = createEditorState();
  const selection = createEditorSelection();
  const hud = createEditorHud();

  // Câmera de voo livre — só usada quando o editor está ativo. Acompanha o aspect.
  const editorCamera = new PerspectiveCamera(60, game.camera.aspect, 0.1, 2000);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      editorCamera.aspect = window.innerWidth / window.innerHeight;
      editorCamera.updateProjectionMatrix();
    });
  }

  // Alvo editável "invisível": o EditorCameraSystem exige uma entidade
  // EditableTarget pra a câmera livre/teleporte/toggle F2 funcionarem mesmo
  // quando o jogo não tem avatar próprio.
  const target = game.world.createEntity();
  target.addComponent(new TransformComponent(0, 0, 0));
  target.addComponent(new EditableTargetComponent());

  const cameraSystem = new EditorCameraSystem(
    editorState,
    editorCamera,
    game.camera,
    game.input,
    three, // raycast de teleporte contra a cena inteira
    hud,
  );
  game.world.addSystem(cameraSystem);

  game.world.addSystem(
    new ObjectEditSystem(
      editorState,
      editorCamera,
      game.canvas,
      game.scene,
      [three],
      game.input,
      hud,
      () => {}, // onSaveEdits — sem persistência por padrão
      () => {}, // onClearEdits
      undefined, // onTransformChange
      (obj) => cameraSystem.focusOn(obj),
      selection,
    ),
  );

  const outliner = createEditorOutliner({
    editRoots: [three],
    selection,
    onFocus: (obj) => cameraSystem.focusOn(obj),
  });
  const inspector = createEditorInspector({ selection });

  let wasActive = false;
  let lastChildren = new Set<Object3D>();

  const snapshot = (): void => {
    lastChildren = new Set(three.children);
  };
  const sceneChanged = (): boolean => {
    const cur = three.children;
    if (cur.length !== lastChildren.size) return true;
    for (const c of cur) if (!lastChildren.has(c)) return true;
    return false;
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
      }
    },
  };
}
