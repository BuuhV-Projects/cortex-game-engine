import * as THREE from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { SceneNode } from '../scene/SceneDefinition.js';
import { sampleSpline, type RoadVec3 } from '../road/RoadSpline.js';
import { isEditorInternalHit } from './assetDrop.js';

/** Cor da prévia/marcador (amarelo de ferramenta). */
const PREVIEW_COLOR = 0xffcc00;
/** A prévia flutua um pouco acima do chão (não some dentro do terreno). */
const PREVIEW_LIFT = 0.1;
/** Densidade da prévia (mais leve que a pista real). */
const PREVIEW_CURVE_DENSITY = 10;
/** Anel do cursor (m). */
const HOVER_INNER = 0.3;
const HOVER_OUTER = 0.5;
const HOVER_SEGMENTS = 24;
const HOVER_LIFT = 0.03;
/** Desenha por cima de tudo. */
const OVERLAY_RENDER_ORDER = 999;
const MIN_POINTS = 2;

/**
 * **Desenhar estrada** (SPEC-0631 §6). Armado (menu "Desenhar estrada"), cada clique no
 * chão adiciona um ponto; a prévia do eixo segue o cursor. **Enter** ou duplo clique
 * finaliza (≥2 pontos) e cria o nó `road`; **Backspace** tira o último ponto; **Esc**
 * cancela. Enquanto desenha, `editorState.drawingShape` fica ligado (seleção/gizmo cedem).
 */
export class RoadDrawSystem extends System {
  static override requiredComponents = [];
  override priority = 26;

  private readonly three: THREE.Scene;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private armed = false;
  private points: RoadVec3[] = [];
  private cursor: RoadVec3 | null = null;
  private preview: THREE.Line | null = null;
  private hover: THREE.Mesh | null = null;
  private readonly prev = new Map<string, boolean>();

  constructor(
    private readonly editorState: EditorState,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    scene: Scene,
    private readonly input: InputManager,
    private readonly hud: EditorHud,
    private readonly onCreate: (node: SceneNode) => void,
  ) {
    super();
    this.three = scene.getThreeScene();
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.armed || !this.editorState.active || e.button !== 0) return;
      this.points.push(this.groundPoint(e.clientX, e.clientY));
      this.rebuildPreview();
      this.hud.showToast(`Estrada: ${this.points.length} ponto(s) · Enter finaliza · Backspace desfaz · Esc cancela`);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.armed) return;
      this.cursor = this.groundPoint(e.clientX, e.clientY);
      this.ensureHover().position.set(this.cursor[0], this.cursor[1] + HOVER_LIFT, this.cursor[2]);
      if (this.points.length > 0) this.rebuildPreview();
    });
    canvas.addEventListener('dblclick', () => {
      if (this.armed) this.finish();
    });
  }

  /** Liga/desliga o modo desenhar estrada. */
  setArmed(on: boolean): void {
    this.cleanup();
    this.armed = on;
    this.editorState.drawingShape = on;
    if (on) this.hud.showToast('Estrada: clique no terreno pra pôr pontos · Enter finaliza');
  }

  get isArmed(): boolean {
    return this.armed;
  }

  override update(_entities: Entity[]): void {
    if (this.armed && !this.editorState.active) this.setArmed(false);
    if (!this.armed) return;
    if (this.edge('Enter')) this.finish();
    if (this.edge('Escape')) this.setArmed(false);
    if (this.edge('Backspace') && this.points.length > 0) {
      this.points.pop();
      this.rebuildPreview();
    }
  }

  private finish(): void {
    // O duplo clique também disparou 2 pointerdown no mesmo lugar: tira o repetido.
    const pts = this.points.filter((p, i, a) => i === 0 || p.some((v, k) => v !== a[i - 1]![k]));
    if (pts.length < MIN_POINTS) {
      this.hud.showToast('A estrada precisa de ao menos 2 pontos');
      return;
    }
    const node: SceneNode = { type: 'road', id: `road-${Date.now().toString(36)}`, points: pts };
    this.setArmed(false);
    this.onCreate(node);
    this.hud.showToast('Estrada criada');
  }

  private rebuildPreview(): void {
    const pts = this.cursor ? [...this.points, this.cursor] : this.points;
    if (pts.length < MIN_POINTS) {
      if (this.preview) this.preview.visible = false;
      return;
    }
    const pos: number[] = [];
    for (const s of sampleSpline(pts, PREVIEW_CURVE_DENSITY)) pos.push(s.pos[0], s.pos[1] + PREVIEW_LIFT, s.pos[2]);
    if (!this.preview) {
      this.preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PREVIEW_COLOR, depthTest: false }));
      this.preview.renderOrder = OVERLAY_RENDER_ORDER;
      this.preview.userData['editorInternal'] = true;
      this.three.add(this.preview);
    }
    this.preview.visible = true;
    this.preview.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.preview.geometry.computeBoundingSphere();
  }

  private ensureHover(): THREE.Mesh {
    if (this.hover) return this.hover;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(HOVER_INNER, HOVER_OUTER, HOVER_SEGMENTS),
      new THREE.MeshBasicMaterial({ color: PREVIEW_COLOR, depthTest: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = OVERLAY_RENDER_ORDER;
    ring.userData['editorInternal'] = true;
    this.three.add(ring);
    this.hover = ring;
    return ring;
  }

  private cleanup(): void {
    for (const o of [this.hover, this.preview]) {
      if (!o) continue;
      this.three.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.hover = null;
    this.preview = null;
    this.points = [];
    this.cursor = null;
  }

  /** Ponto no chão sob o cursor (primeira superfície da cena; plano y=0 se nada). */
  private groundPoint(clientX: number, clientY: number): RoadVec3 {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.three.children, true).find((h) => !isEditorInternalHit(h));
    if (hit) return [hit.point.x, hit.point.y, hit.point.z];
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, out) ? [out.x, out.y, out.z] : [0, 0, 0];
  }

  private edge(key: string): boolean {
    const now = this.input.isKeyDown(key);
    const before = this.prev.get(key) ?? false;
    this.prev.set(key, now);
    return now && !before;
  }
}
