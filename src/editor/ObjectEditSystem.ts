import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { EditorSelection } from './EditorSelection.js';

/** Transform editada de um objeto, por nome (`Object3D.name`). */
export interface ObjectEdit {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Editor de cena estilo Blender/Unity: clique pra selecionar um objeto dentro
 * dos `editRoots`, arrasta os eixos do gizmo (TransformControls) pra mover/
 * rotacionar/escalar. Só roda quando `editorState.active`.
 *
 * Teclas: click = selecionar; 1/2/3 = translate/rotate/scale; Esc = desselecionar;
 * K = salvar edições (callback `onSaveEdits`); L = limpar (`onClearEdits`);
 * F = focar no selecionado (`onFocusRequest`).
 *
 * Persiste por `Object3D.name` (objetos sem nome são ignorados). O que fazer com
 * as edições fica a cargo do jogo (callbacks).
 */
export class ObjectEditSystem extends System {
  static override requiredComponents = [];
  override priority = 27;

  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly modified = new Map<string, THREE.Object3D>();
  private clickPending: { x: number; y: number } | null = null;
  private selected: THREE.Object3D | null = null;
  private prev = new Map<string, boolean>();

  constructor(
    private readonly editorState: EditorState,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    scene: Scene,
    /**
     * Roots editáveis (ex.: `[track.root, carContainer]`). O raycast procura
     * recursivamente e sobe até o filho direto do root correspondente — assim
     * cliques em meshes internas selecionam o "prop" inteiro.
     */
    private readonly editRoots: THREE.Object3D[],
    private readonly input: InputManager,
    private readonly hud: EditorHud,
    private readonly onSaveEdits: (edits: Record<string, ObjectEdit>) => void,
    private readonly onClearEdits: () => void,
    /** Chamado quando a transform do selecionado muda (durante drag) — sync ECS. */
    private readonly onTransformChange?: (obj: THREE.Object3D) => void,
    /** Chamado ao apertar F com algo selecionado — tipicamente liga ao focusOn da câmera. */
    private readonly onFocusRequest?: (obj: THREE.Object3D) => void,
    /**
     * Ponte de seleção observável (opcional). Quando presente, a seleção é
     * espelhada nela (pra a UI de hierarquia/inspector reagir) e pedidos de
     * seleção vindos da UI (`requestSelect`) são atendidos. Ver
     * {@link EditorSelection}.
     */
    private readonly selection?: EditorSelection,
  ) {
    super();

    // A UI (outliner) pede seleção via requestSelect; o sistema é quem ataca o
    // gizmo e confirma via setCurrent (dentro de select()).
    this.selection?.onSelectRequest((obj) => this.select(obj));

    this.controls = new TransformControls(camera, canvas);
    this.controls.setMode('translate');
    this.controls.setSize(1.4);
    this.controls.enabled = false;
    // three r170+ separou o controlador (lógica) do helper (mesh visível). Só o
    // helper vai pra cena — adicionar `controls` direto dispara "not an Object3D".
    const helper = (this.controls as unknown as { getHelper(): THREE.Object3D }).getHelper();
    this.helper = helper;
    helper.visible = false;
    // Marca o gizmo como interno pra a UI (hierarquia) não listá-lo como objeto.
    helper.userData['editorInternal'] = true;
    scene.getThreeScene().add(helper);

    this.controls.addEventListener('change', () => {
      if (!this.selected) return;
      const name = this.selected.name;
      if (name) this.modified.set(name, this.selected);
      this.onTransformChange?.(this.selected);
      this.selection?.emitTransform();
    });
    this.controls.addEventListener('dragging-changed', ((e: { value: boolean }) => {
      this.editorState.gizmoDragging = e.value;
    }) as unknown as (e: unknown) => void);

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.editorState.active) return;
      if (e.button !== 0) return;
      const dragging = (this.controls as unknown as { dragging: boolean }).dragging;
      if (dragging) return;
      this.clickPending = { x: e.clientX, y: e.clientY };
    });
  }

  override update(_entities: Entity[]): void {
    if (!this.editorState.active) {
      if (this.helper.visible) {
        this.helper.visible = false;
        this.controls.detach();
      }
      this.controls.enabled = false;
      return;
    }
    this.controls.enabled = true;

    if (this.clickPending) {
      this.handleSelection(this.clickPending.x, this.clickPending.y);
      this.clickPending = null;
    }

    if (this.edge('1')) {
      this.controls.setMode('translate');
      this.hud.showToast('Modo: mover (setas)');
    }
    if (this.edge('2')) {
      this.controls.setMode('rotate');
      this.hud.showToast('Modo: rotacionar (anéis)');
    }
    if (this.edge('3')) {
      this.controls.setMode('scale');
      this.hud.showToast('Modo: escalar (cubos)');
    }
    if (this.edge('Escape')) {
      this.deselect();
    }
    if (this.edge('k') || this.edge('K')) {
      this.persist();
    }
    if (this.edge('l') || this.edge('L')) {
      this.onClearEdits();
      this.modified.clear();
      this.hud.showToast('Cena limpa (recarregue pra ver o original)');
    }
    if (this.edge('f') || this.edge('F')) {
      if (this.selected && this.onFocusRequest) {
        this.onFocusRequest(this.selected);
        const label = this.selected.name || '(sem nome)';
        this.hud.showToast(`Focado em ${label}`);
      }
    }
  }

  private handleSelection(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hits = this.raycaster.intersectObjects(this.editRoots, true);

    // Pega o primeiro hit que NÃO seja interno do editor. O helper do gizmo fica
    // na cena (mesmo invisível) e é raycastável — sem este filtro, clicar através
    // dele selecionaria o próprio gizmo e o attach() o prenderia em si mesmo,
    // causando recursão infinita em updateMatrixWorld (tela preta).
    for (const hit of hits) {
      if (this.isEditorInternal(hit.object)) continue;
      const root = this.findOwningRoot(hit.object);
      if (!root) continue;
      let target: THREE.Object3D = hit.object;
      while (target.parent && target.parent !== root) {
        target = target.parent;
      }
      this.select(target);
      return;
    }
    this.deselect();
  }

  /** `true` se o objeto (ou algum ancestral) é marcado interno do editor (gizmo). */
  private isEditorInternal(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData['editorInternal'] === true) return true;
      cur = cur.parent;
    }
    return false;
  }

  /**
   * Seleciona um objeto (ou desseleciona com `null`), atacando/soltando o gizmo
   * e espelhando na {@link EditorSelection}. Público pra a UI (hierarquia) poder
   * dirigir a seleção — embora o caminho recomendado pela UI seja
   * `selection.requestSelect(obj)`, que chega aqui.
   *
   * @param target - Objeto a selecionar, ou `null` pra desselecionar.
   */
  select(target: THREE.Object3D | null): void {
    if (this.selected === target) return;
    this.selected = target;
    if (target) {
      this.controls.attach(target);
      this.helper.visible = true;
      this.hud.showToast(`Selecionado: ${target.name || '(sem nome)'}`);
    } else {
      this.controls.detach();
      this.helper.visible = false;
      this.hud.showToast('Desselecionado');
    }
    this.selection?.setCurrent(target);
  }

  private findOwningRoot(obj: THREE.Object3D): THREE.Object3D | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (this.editRoots.includes(cur)) return cur;
      cur = cur.parent;
    }
    return null;
  }

  private deselect(): void {
    this.select(null);
  }

  private persist(): void {
    const edits: Record<string, ObjectEdit> = {};
    for (const [name, obj] of this.modified) {
      edits[name] = {
        px: obj.position.x, py: obj.position.y, pz: obj.position.z,
        rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z,
        sx: obj.scale.x, sy: obj.scale.y, sz: obj.scale.z,
      };
    }
    this.onSaveEdits(edits);
    this.hud.showToast(`Cena salva (${this.modified.size} objeto(s) editado(s))`);
  }

  private edge(key: string): boolean {
    const now = this.input.isKeyDown(key);
    const before = this.prev.get(key) ?? false;
    this.prev.set(key, now);
    return now && !before;
  }
}
