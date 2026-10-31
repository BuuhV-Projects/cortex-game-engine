import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { EditorSelection } from './EditorSelection.js';
import type { RoadEditApi } from './authoring/RoadAuthoring.js';
import { roadNodeOf } from '../scene/RoadBuild.js';

const HANDLE_RADIUS = 0.6;
const HANDLE_W_SEGMENTS = 16;
const HANDLE_H_SEGMENTS = 12;
const HANDLE_COLOR = 0xffcc00;
const HANDLE_SELECTED_COLOR = 0xff6a00;
const HANDLE_RENDER_ORDER = 1000;
const GIZMO_SIZE = 0.8;

/**
 * **Edição do traçado da estrada** (SPEC-0631 §6). Com `editorState.editingRoad` e uma
 * estrada selecionada, mostra uma esfera em cada ponto. Clicar numa anexa o gizmo;
 * arrastar move o ponto (a pista acompanha ao vivo); soltar remolda o terreno e salva o
 * overlay. **Delete** remove o ponto selecionado (mínimo 2). **Esc** ou Tab sai.
 */
export class RoadEditSystem extends System {
  static override requiredComponents = [];
  override priority = 29; // logo após o MeshEditSystem (28)

  private readonly three: THREE.Scene;
  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly proxy = new THREE.Object3D();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly handleGeo = new THREE.SphereGeometry(HANDLE_RADIUS, HANDLE_W_SEGMENTS, HANDLE_H_SEGMENTS);
  private target: THREE.Object3D | null = null;
  private handles: THREE.Mesh[] = [];
  private group: THREE.Group | null = null;
  private selected = -1;
  private clickPending: { x: number; y: number } | null = null;
  private readonly prev = new Map<string, boolean>();

  constructor(
    private readonly editorState: EditorState,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    scene: Scene,
    private readonly input: InputManager,
    private readonly hud: EditorHud,
    private readonly selection: EditorSelection,
    private readonly api: RoadEditApi,
  ) {
    super();
    this.three = scene.getThreeScene();
    this.controls = new TransformControls(camera, canvas);
    this.controls.setMode('translate');
    this.controls.setSize(GIZMO_SIZE);
    this.controls.enabled = false;
    this.helper = (this.controls as unknown as { getHelper(): THREE.Object3D }).getHelper();
    this.helper.visible = false;
    this.helper.userData['editorInternal'] = true;
    this.proxy.userData['editorInternal'] = true;
    this.three.add(this.helper, this.proxy);

    this.controls.addEventListener('dragging-changed', ((e: { value: boolean }) => {
      this.editorState.gizmoDragging = e.value;
      if (!e.value && this.target && this.selected >= 0) {
        this.api.commit(this.target);
        this.hud.showToast('Traçado atualizado');
      }
    }) as unknown as (e: unknown) => void);
    this.controls.addEventListener('change', () => {
      if (!this.target || this.selected < 0 || !this.editorState.gizmoDragging) return;
      const p = this.proxy.position;
      this.api.setPoint(this.target, this.selected, [p.x, p.y, p.z]);
      this.handles[this.selected]?.position.copy(p);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.editorState.active || !this.editorState.editingRoad || e.button !== 0) return;
      if ((this.controls as unknown as { dragging: boolean }).dragging) return;
      this.clickPending = { x: e.clientX, y: e.clientY };
    });
  }

  /** Entra na edição do traçado da estrada `obj`. */
  enter(obj: THREE.Object3D): void {
    if (!roadNodeOf(obj)) {
      this.hud.showToast('Selecione uma estrada pra editar o traçado');
      return;
    }
    this.selection.requestSelect(obj);
    this.editorState.editingRoad = true;
    this.hud.showToast('Editar traçado: arraste os pontos · Delete remove · Esc sai');
  }

  /** Sai da edição do traçado. */
  exit(): void {
    if (!this.editorState.editingRoad) return;
    this.editorState.editingRoad = false;
    this.teardown();
  }

  override update(_entities: Entity[]): void {
    if (!this.editorState.active || !this.editorState.editingRoad) {
      if (this.target) this.teardown();
      return;
    }
    const sel = this.selection.current;
    const road = sel && roadNodeOf(sel) ? sel : null;
    if (road !== this.target) {
      this.teardown();
      this.target = road;
      if (road) this.buildHandles();
    }
    if (!this.target) {
      this.exit(); // selecionou algo que não é estrada
      return;
    }
    this.controls.enabled = true;
    if (this.clickPending) {
      this.pick(this.clickPending.x, this.clickPending.y);
      this.clickPending = null;
    }
    const ae = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
    if (this.edge('Escape') || this.edge('Tab')) this.exit();
    else if (this.edge('Delete') && this.selected >= 0) this.removeSelected();
  }

  private removeSelected(): void {
    if (!this.target) return;
    if (!this.api.removePoint(this.target, this.selected)) {
      this.hud.showToast('A estrada precisa de ao menos 2 pontos');
      return;
    }
    this.buildHandles();
  }

  private buildHandles(): void {
    this.disposeHandles();
    const points = this.target ? this.api.pointsOf(this.target) : null;
    if (!points) return;
    const group = new THREE.Group();
    group.userData['editorInternal'] = true;
    points.forEach((p, i) => {
      const h = new THREE.Mesh(this.handleGeo, new THREE.MeshBasicMaterial({ color: HANDLE_COLOR, depthTest: false }));
      h.position.set(p[0], p[1], p[2]);
      h.renderOrder = HANDLE_RENDER_ORDER;
      h.userData['editorInternal'] = true;
      h.userData['roadPointIndex'] = i;
      group.add(h);
      this.handles.push(h);
    });
    this.three.add(group);
    this.group = group;
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.handles, false)[0];
    if (!hit) return;
    this.selected = hit.object.userData['roadPointIndex'] as number;
    this.proxy.position.copy(hit.object.position);
    this.controls.attach(this.proxy);
    this.helper.visible = true;
    this.handles.forEach((h, i) =>
      (h.material as THREE.MeshBasicMaterial).color.setHex(i === this.selected ? HANDLE_SELECTED_COLOR : HANDLE_COLOR),
    );
  }

  private disposeHandles(): void {
    if (this.group) this.three.remove(this.group);
    for (const h of this.handles) (h.material as THREE.Material).dispose();
    this.group = null;
    this.handles = [];
    this.selected = -1;
    this.controls.detach();
    this.helper.visible = false;
  }

  private teardown(): void {
    this.disposeHandles();
    this.controls.enabled = false;
    this.target = null;
  }

  private edge(key: string): boolean {
    const now = this.input.isKeyDown(key);
    const before = this.prev.get(key) ?? false;
    this.prev.set(key, now);
    return now && !before;
  }
}
