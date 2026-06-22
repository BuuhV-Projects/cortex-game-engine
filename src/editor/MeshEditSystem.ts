import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { EditorSelection } from './EditorSelection.js';
import type { MeshEditToolbar } from './MeshEditToolbar.js';
import {
  type EditableMesh,
  type MeshElement,
  type MeshPickMaps,
  verticesOfElement,
  centroidOf,
  translateVertices,
  extrudeFace,
} from '../probuilder/EditableMesh.js';

/** Modo de edição de elemento (subconjunto de {@link EditorState.meshEditMode}). */
export type ElementMode = 'vertex' | 'edge' | 'face';

/** O que o {@link MeshEditSystem} precisa da autoria de malha (ver MeshAuthoring). */
export interface MeshEditApi {
  /** Troca a geometria de render ao vivo (sem persistir). */
  rebuild(obj: THREE.Object3D, mesh: EditableMesh): void;
  /** Grava o override de geometria + regenera (persiste). */
  applyGeometry(obj: THREE.Object3D, mesh: EditableMesh): void;
  /** Malha lógica atual do objeto, ou `null`. */
  logicalOf(obj: THREE.Object3D): EditableMesh | null;
}

const VERT_NDC = 0.025; // tolerância de clique (NDC) pra vértice/aresta

/**
 * **Edição de elementos de malha** (vertex/edge/face — blockout/ProBuilder,
 * ADR-0071). Quando `editorState.meshEditMode !== 'object'` e há um nó `mesh`
 * selecionado, mostra um overlay de elementos (pontos + arestas), deixa **clicar**
 * pra selecionar um vértice/aresta/face, **mover** pelo gizmo (um proxy no
 * centróide) e **extrudar** a face (tecla E). O {@link ObjectEditSystem} cede o
 * clique/gizmo nesse modo.
 *
 * Persistência: a malha editada vira override em `overlay.data.geometry[id]` (via
 * {@link MeshEditApi.applyGeometry}) — overlay vence a receita (ADR-0071).
 *
 * Teclas (em modo de malha): `1/2/3` = vértice/aresta/face; `E` = extrudar face;
 * `Tab` = sair pro modo objeto; `Esc` = limpar a seleção de elemento.
 */
export class MeshEditSystem extends System {
  static override requiredComponents = [];
  override priority = 28; // logo após o ObjectEditSystem (27)

  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly proxy = new THREE.Object3D();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private target: THREE.Mesh | null = null;
  private element: MeshElement | null = null;
  private overlayGroup: THREE.Group | null = null;

  // Estado do drag (capturado em dragging-changed=true pra evitar deriva).
  private dragBase: EditableMesh | null = null;
  private dragIndices: number[] = [];
  private proxyStart = new THREE.Vector3();
  private latest: EditableMesh | null = null;

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
    private readonly mesh: MeshEditApi,
    /** Barra flutuante (Unity-like) — opcional; o sistema a mantém sincronizada. */
    private readonly toolbar?: MeshEditToolbar,
  ) {
    super();
    this.raycaster.params.Points = { threshold: 0.2 };

    this.controls = new TransformControls(camera, canvas);
    this.controls.setMode('translate');
    this.controls.setSize(0.9);
    this.controls.enabled = false;
    this.helper = (this.controls as unknown as { getHelper(): THREE.Object3D }).getHelper();
    this.helper.visible = false;
    this.helper.userData['editorInternal'] = true;
    this.proxy.userData['editorInternal'] = true;
    const root = scene.getThreeScene();
    root.add(this.helper);
    root.add(this.proxy);

    this.controls.addEventListener('dragging-changed', ((e: { value: boolean }) => {
      this.editorState.gizmoDragging = e.value;
      if (e.value) this.beginDrag();
      else this.endDrag();
    }) as unknown as (e: unknown) => void);

    this.controls.addEventListener('change', () => this.onGizmoChange());

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.editorState.active) return;
      if (this.editorState.drawingShape) return; // desenho de caixa assume o clique
      if (this.editorState.meshEditMode === 'object') return;
      if (e.button !== 0) return;
      if ((this.controls as unknown as { dragging: boolean }).dragging) return;
      this.clickPending = { x: e.clientX, y: e.clientY };
    });
  }

  override update(_entities: Entity[]): void {
    // Alvo = seleção atual, se for um nó mesh (tem cortexMesh).
    const sel = this.selection.current;
    const selMesh = sel && (sel.userData as Record<string, unknown>)['cortexMesh'] ? (sel as THREE.Mesh) : null;

    // Barra flutuante (Unity-like): visível quando o editor está ativo e a seleção
    // é uma malha — em QUALQUER modo (inclusive 'object', pra poder entrar na edição).
    this.toolbar?.update({
      visible: this.editorState.active && !!selMesh,
      mode: this.editorState.meshEditMode,
      canExtrude: this.hasFaceSelected(),
    });

    const editing = this.editorState.active && this.editorState.meshEditMode !== 'object';
    if (!editing) {
      if (this.target) this.teardown();
      return;
    }
    if (selMesh !== this.target) {
      this.teardown();
      this.target = selMesh;
      if (this.target) this.buildOverlay();
    }
    if (!this.target) return;

    this.controls.enabled = true;

    if (this.clickPending) {
      this.pick(this.clickPending.x, this.clickPending.y);
      this.clickPending = null;
    }

    // Atalhos (ignora quando digitando num campo).
    const ae = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;

    if (this.edge('1')) this.setElementMode('vertex');
    if (this.edge('2')) this.setElementMode('edge');
    if (this.edge('3')) this.setElementMode('face');
    if (this.edge('e') || this.edge('E')) this.extrudeSelected();
    if (this.edge('Escape')) this.clearElement();
    if (this.edge('Tab')) this.exit();
  }

  // ── API pública (HUD / Inspector) ──────────────────────────────────────────────

  /** Modo atual (`object` quando fora da edição de malha). */
  get mode(): 'object' | ElementMode {
    return this.editorState.meshEditMode;
  }

  /** Entra na edição de elementos (precisa de um nó mesh selecionado). */
  enter(mode: ElementMode = 'face'): void {
    const sel = this.selection.current;
    if (!sel || !(sel.userData as Record<string, unknown>)['cortexMesh']) {
      this.hud.showToast('Selecione uma malha pra editar');
      return;
    }
    this.editorState.meshEditMode = mode;
    this.hud.showToast(`Edição de malha: ${this.label(mode)}`);
  }

  /** Sai da edição de elementos (volta pro modo objeto). */
  exit(): void {
    this.editorState.meshEditMode = 'object';
    this.clearElement();
    this.hud.showToast('Edição de malha: objeto');
  }

  /** Troca o tipo de elemento (vértice/aresta/face) sem sair da edição. */
  setElementMode(mode: ElementMode): void {
    this.editorState.meshEditMode = mode;
    this.clearElement();
    this.hud.showToast(`Elemento: ${this.label(mode)}`);
  }

  /** Há uma face selecionada (pra habilitar o botão Extrudar)? */
  hasFaceSelected(): boolean {
    return this.element?.mode === 'face';
  }

  /** Extruda a face selecionada pela normal + entra em mover. */
  extrudeSelected(): void {
    if (!this.target || this.element?.mode !== 'face') {
      this.hud.showToast('Selecione uma face pra extrudar');
      return;
    }
    const logical = this.mesh.logicalOf(this.target);
    if (!logical) return;
    const { mesh: out, faceIndex } = extrudeFace(logical, this.element.faceIndex, 1);
    this.mesh.applyGeometry(this.target, out);
    this.element = { mode: 'face', faceIndex };
    this.buildOverlay();
    this.attachToElement();
    this.hud.showToast('Face extrudada');
  }

  // ── Picking ─────────────────────────────────────────────────────────────────────

  private pick(clientX: number, clientY: number): void {
    if (!this.target) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const logical = this.mesh.logicalOf(this.target);
    if (!logical) return;
    const mode = this.editorState.meshEditMode;

    if (mode === 'face') {
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const hit = this.raycaster.intersectObject(this.target, false)[0];
      const tri = hit?.faceIndex;
      const maps = this.maps();
      if (typeof tri === 'number' && maps && maps.triToFace[tri] !== undefined) {
        this.element = { mode: 'face', faceIndex: maps.triToFace[tri]! };
        this.attachToElement();
        return;
      }
    } else if (mode === 'vertex') {
      const i = this.nearestVertex(logical);
      if (i >= 0) {
        this.element = { mode: 'vertex', index: i };
        this.attachToElement();
        return;
      }
    } else {
      const e = this.nearestEdge(logical);
      if (e) {
        this.element = { mode: 'edge', a: e[0], b: e[1] };
        this.attachToElement();
        return;
      }
    }
    this.clearElement();
  }

  /** Índice do vértice cuja projeção em tela é mais próxima do clique (ou -1). */
  private nearestVertex(logical: EditableMesh): number {
    this.target!.updateMatrixWorld();
    let best = -1;
    let bestD = VERT_NDC;
    const v = new THREE.Vector3();
    for (let i = 0; i < logical.positions.length; i++) {
      const p = logical.positions[i]!;
      v.set(p[0], p[1], p[2]);
      this.target!.localToWorld(v).project(this.camera);
      if (v.z < -1 || v.z > 1) continue;
      const d = Math.hypot(v.x - this.ndc.x, v.y - this.ndc.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Aresta cujo ponto médio projetado é mais próximo do clique (ou null). */
  private nearestEdge(logical: EditableMesh): [number, number] | null {
    const maps = this.maps();
    if (!maps) return null;
    this.target!.updateMatrixWorld();
    let best: [number, number] | null = null;
    let bestD = VERT_NDC * 1.5;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const [i, j] of maps.edges) {
      const pa = logical.positions[i]!;
      const pb = logical.positions[j]!;
      a.set(pa[0], pa[1], pa[2]);
      b.set(pb[0], pb[1], pb[2]);
      this.target!.localToWorld(a).project(this.camera);
      this.target!.localToWorld(b).project(this.camera);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = Math.hypot(mx - this.ndc.x, my - this.ndc.y);
      if (d < bestD) {
        bestD = d;
        best = [i, j];
      }
    }
    return best;
  }

  // ── Gizmo / move ─────────────────────────────────────────────────────────────────

  private attachToElement(): void {
    if (!this.target || !this.element) return;
    const logical = this.mesh.logicalOf(this.target);
    if (!logical) return;
    const indices = verticesOfElement(logical, this.element);
    const c = centroidOf(logical, indices);
    this.target.updateMatrixWorld();
    const world = this.target.localToWorld(new THREE.Vector3(c[0], c[1], c[2]));
    this.proxy.position.copy(world);
    this.controls.attach(this.proxy);
    this.helper.visible = true;
    this.refreshSelectionHighlight();
  }

  private beginDrag(): void {
    if (!this.target || !this.element) return;
    const logical = this.mesh.logicalOf(this.target);
    if (!logical) return;
    this.dragBase = logical;
    this.dragIndices = verticesOfElement(logical, this.element);
    this.proxyStart.copy(this.proxy.position);
    this.latest = logical;
  }

  private onGizmoChange(): void {
    if (!this.target || !this.dragBase || this.dragIndices.length === 0) return;
    this.target.updateMatrixWorld();
    const now = this.target.worldToLocal(this.proxy.position.clone());
    const start = this.target.worldToLocal(this.proxyStart.clone());
    const delta: [number, number, number] = [now.x - start.x, now.y - start.y, now.z - start.z];
    this.latest = translateVertices(this.dragBase, this.dragIndices, delta);
    this.mesh.rebuild(this.target, this.latest);
    this.refreshOverlayPositions(this.latest);
  }

  private endDrag(): void {
    if (!this.target || !this.latest || !this.dragBase) return;
    this.mesh.applyGeometry(this.target, this.latest);
    this.dragBase = null;
    this.dragIndices = [];
    // Reancora o proxy no novo centróide (a geometria mudou).
    this.attachToElement();
  }

  private clearElement(): void {
    this.element = null;
    this.controls.detach();
    this.helper.visible = false;
    this.refreshSelectionHighlight();
  }

  // ── Overlay visual (pontos + arestas + destaque) ─────────────────────────────────

  private maps(): MeshPickMaps | null {
    const cm = (this.target?.userData as Record<string, unknown>)['cortexMesh'] as { maps?: MeshPickMaps } | undefined;
    return cm?.maps ?? null;
  }

  private buildOverlay(): void {
    if (!this.target) return;
    this.disposeOverlay();
    const logical = this.mesh.logicalOf(this.target);
    if (!logical) return;
    const group = new THREE.Group();
    group.userData['editorInternal'] = true;

    // Arestas (linhas).
    const edges = this.maps()?.edges ?? [];
    const ePos: number[] = [];
    for (const [i, j] of edges) {
      const a = logical.positions[i]!;
      const b = logical.positions[j]!;
      ePos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
    const eLines = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: 0x33d2ff, depthTest: false }));
    eLines.renderOrder = 999;
    eLines.userData['editorInternal'] = true;
    eLines.name = 'cortexMeshEdges';
    group.add(eLines);

    // Pontos (vértices).
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.Float32BufferAttribute(logical.positions.flat(), 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 9, sizeAttenuation: false, depthTest: false }),
    );
    points.renderOrder = 1000;
    points.userData['editorInternal'] = true;
    points.name = 'cortexMeshPoints';
    group.add(points);

    // Destaque do elemento selecionado (pontos amarelos maiores).
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    const sel = new THREE.Points(
      sGeo,
      new THREE.PointsMaterial({ color: 0xffcc00, size: 14, sizeAttenuation: false, depthTest: false }),
    );
    sel.renderOrder = 1001;
    sel.userData['editorInternal'] = true;
    sel.name = 'cortexMeshSel';
    group.add(sel);

    this.target.add(group);
    this.overlayGroup = group;
    this.refreshSelectionHighlight();
  }

  /** Atualiza pontos/arestas após a malha mudar (durante o drag). */
  private refreshOverlayPositions(logical: EditableMesh): void {
    if (!this.overlayGroup) return;
    const points = this.overlayGroup.getObjectByName('cortexMeshPoints') as THREE.Points | undefined;
    if (points) {
      points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(logical.positions.flat(), 3));
    }
    const lines = this.overlayGroup.getObjectByName('cortexMeshEdges') as THREE.LineSegments | undefined;
    const edges = this.maps()?.edges ?? [];
    if (lines) {
      const ePos: number[] = [];
      for (const [i, j] of edges) {
        const a = logical.positions[i]!;
        const b = logical.positions[j]!;
        ePos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
    }
    this.refreshSelectionHighlight();
  }

  private refreshSelectionHighlight(): void {
    if (!this.overlayGroup || !this.target) return;
    const sel = this.overlayGroup.getObjectByName('cortexMeshSel') as THREE.Points | undefined;
    if (!sel) return;
    const logical = this.mesh.logicalOf(this.target);
    const pos: number[] = [];
    if (logical && this.element) {
      for (const i of verticesOfElement(logical, this.element)) {
        const p = logical.positions[i];
        if (p) pos.push(p[0], p[1], p[2]);
      }
    }
    sel.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  private disposeOverlay(): void {
    if (!this.overlayGroup) return;
    this.overlayGroup.parent?.remove(this.overlayGroup);
    this.overlayGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.overlayGroup = null;
  }

  private teardown(): void {
    this.disposeOverlay();
    this.controls.detach();
    this.helper.visible = false;
    this.controls.enabled = false;
    this.target = null;
    this.element = null;
    this.dragBase = null;
    this.latest = null;
  }

  private label(mode: ElementMode): string {
    return mode === 'vertex' ? 'vértice' : mode === 'edge' ? 'aresta' : 'face';
  }

  private edge(key: string): boolean {
    const now = this.input.isKeyDown(key);
    const before = this.prev.get(key) ?? false;
    this.prev.set(key, now);
    return now && !before;
  }
}
