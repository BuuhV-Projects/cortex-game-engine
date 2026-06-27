import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { EditorSelection } from './EditorSelection.js';

/** O que o {@link RoadEditSystem} precisa da autoria de estrada (ver RoadAuthoring). */
export interface RoadEditApi {
  /** Pontos de controle (world) da estrada selecionada, ou `null` se não for editável. */
  nodesOf(obj: THREE.Object3D): [number, number, number][] | null;
  /** Move um ponto e **regenera a pista ao vivo** (sem remoldar o terreno). */
  setNode(obj: THREE.Object3D, index: number, pos: [number, number, number]): void;
  /** Confirma: **remolda o terreno** ao traçado novo + persiste (ao soltar o ponto). */
  commit(obj: THREE.Object3D): void;
}

/**
 * **Edição do traçado da estrada** (ADR-0072). Com `editorState.editingRoad` ligado e
 * uma estrada selecionada, mostra um **handle** (esfera) em cada ponto de controle da
 * spline. Clicar num handle anexa o gizmo de mover; arrastar atualiza o ponto e
 * **regenera a pista ao vivo**; ao **soltar**, o **terreno se reajusta** ao traçado
 * novo (cut & fill) e persiste. O {@link ObjectEditSystem} cede o clique/gizmo nesse modo.
 *
 * `Esc`/`Tab` saem da edição. Selecionar outro objeto também sai.
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

  private target: THREE.Mesh | null = null;
  private handles: THREE.Mesh[] = [];
  private group: THREE.Group | null = null;
  private selectedNode = -1;
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
    this.controls.setSize(0.8);
    this.controls.enabled = false;
    this.helper = (this.controls as unknown as { getHelper(): THREE.Object3D }).getHelper();
    this.helper.visible = false;
    this.helper.userData['editorInternal'] = true;
    this.proxy.userData['editorInternal'] = true;
    this.three.add(this.helper);
    this.three.add(this.proxy);

    this.controls.addEventListener('dragging-changed', ((e: { value: boolean }) => {
      this.editorState.gizmoDragging = e.value;
      if (!e.value) this.onRelease(); // soltou o ponto → remolda o terreno + persiste
    }) as unknown as (e: unknown) => void);
    this.controls.addEventListener('change', () => this.onGizmoChange());

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.editorState.active || !this.editorState.editingRoad || e.button !== 0) return;
      if ((this.controls as unknown as { dragging: boolean }).dragging) return;
      this.clickPending = { x: e.clientX, y: e.clientY };
    });
  }

  /** Entra na edição de traçado da estrada `obj` (precisa ser um nó `road`). */
  enter(obj: THREE.Object3D): void {
    if (!(obj.userData as Record<string, unknown>)['cortexRoad']) {
      this.hud.showToast('Selecione uma estrada pra editar o traçado');
      return;
    }
    this.selection.requestSelect(obj);
    this.editorState.editingRoad = true;
    this.hud.showToast('Editar traçado: arraste os pontos · Esc finaliza');
  }

  /** Sai da edição de traçado (volta pro modo objeto). */
  exit(): void {
    if (!this.editorState.editingRoad) return;
    this.editorState.editingRoad = false;
    this.teardown();
    this.hud.showToast('Traçado finalizado');
  }

  override update(_entities: Entity[]): void {
    if (!this.editorState.active || !this.editorState.editingRoad) {
      if (this.target) this.teardown();
      return;
    }
    const sel = this.selection.current;
    const road = sel && (sel.userData as Record<string, unknown>)['cortexRoad'] ? (sel as THREE.Mesh) : null;
    if (road !== this.target) {
      this.teardown();
      this.target = road;
      if (this.target) this.buildHandles();
    }
    if (!this.target) {
      this.exit(); // selecionou algo que não é estrada → sai da edição
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
  }

  // ── Handles (esferas nos pontos de controle) ─────────────────────────────────────

  private buildHandles(): void {
    this.disposeHandles();
    if (!this.target) return;
    const nodes = this.api.nodesOf(this.target);
    if (!nodes) return;
    const group = new THREE.Group();
    group.userData['editorInternal'] = true;
    const geo = new THREE.SphereGeometry(0.6, 16, 12);
    nodes.forEach((p, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false });
      const h = new THREE.Mesh(geo, mat);
      h.position.set(p[0], p[1], p[2]);
      h.renderOrder = 1000;
      h.userData['editorInternal'] = true;
      h.userData['roadNodeIndex'] = i;
      group.add(h);
      this.handles.push(h);
    });
    this.three.add(group);
    this.group = group;
  }

  private pick(clientX: number, clientY: number): void {
    if (!this.target) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.handles, false)[0];
    if (!hit) return; // clique fora de um handle: mantém a seleção atual
    this.selectedNode = (hit.object.userData as Record<string, unknown>)['roadNodeIndex'] as number;
    this.proxy.position.copy(hit.object.position);
    this.controls.attach(this.proxy);
    this.helper.visible = true;
    this.highlight();
  }

  private onGizmoChange(): void {
    if (!this.target || this.selectedNode < 0) return;
    const p = this.proxy.position;
    this.api.setNode(this.target, this.selectedNode, [p.x, p.y, p.z]); // regenera a pista ao vivo
    const h = this.handles[this.selectedNode];
    if (h) h.position.copy(p);
  }

  private onRelease(): void {
    if (!this.target || this.selectedNode < 0) return;
    this.api.commit(this.target); // remolda o terreno ao traçado novo + persiste
    this.hud.showToast('Traçado atualizado');
  }

  private highlight(): void {
    this.handles.forEach((h, i) => {
      (h.material as THREE.MeshBasicMaterial).color.setHex(i === this.selectedNode ? 0xff6a00 : 0xffcc00);
    });
  }

  private disposeHandles(): void {
    if (this.group) {
      this.three.remove(this.group);
      for (const h of this.handles) {
        h.geometry.dispose();
        (h.material as THREE.Material).dispose();
      }
      this.group = null;
    }
    this.handles = [];
    this.selectedNode = -1;
  }

  private teardown(): void {
    this.disposeHandles();
    this.controls.detach();
    this.helper.visible = false;
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
