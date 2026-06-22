import * as THREE from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { SceneNode } from '../scene/SceneDefinition.js';
import { sampleSpline, type Vec3 } from '../road/RoadSpline.js';

/**
 * **Desenhar estrada** (Road Architect → Cortex, ADR-0072). Arme o modo e **clique no
 * terreno** pra adicionar pontos de controle da spline; uma prévia (linha central)
 * acompanha o cursor. **Enter** ou **duplo-clique** finaliza → cria o nó `road`
 * (conformado ao terreno). **Esc** cancela.
 *
 * Enquanto desenha, `editorState.drawingShape = true` (o ObjectEditSystem/MeshEditSystem
 * cedem o clique — mesma porteira das outras ferramentas de desenho).
 */
export class RoadDrawSystem extends System {
  static override requiredComponents = [];
  override priority = 26;

  private readonly three: THREE.Scene;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private armed = false;
  private points: Vec3[] = [];
  private cursor: Vec3 | null = null;
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
      this.hud.showToast(`Estrada: ${this.points.length} ponto(s) · Enter finaliza · Esc cancela`);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.armed) return;
      this.cursor = this.groundPoint(e.clientX, e.clientY);
      this.updateHover(this.cursor);
      if (this.points.length >= 1) this.rebuildPreview();
    });
    canvas.addEventListener('dblclick', () => {
      if (this.armed) this.finish();
    });
  }

  /** Liga/desliga o modo desenhar estrada. */
  setArmed(on: boolean): void {
    this.armed = on;
    this.editorState.drawingShape = on;
    this.points = [];
    this.cursor = null;
    if (on) {
      this.showHover();
      this.hud.showToast('Estrada: clique no terreno pra adicionar pontos · Enter finaliza');
    } else {
      this.cleanup();
    }
  }

  get isArmed(): boolean {
    return this.armed;
  }

  override update(_entities: Entity[]): void {
    if (!this.editorState.active && this.armed) this.setArmed(false);
    if (!this.armed) return;
    if (this.edge('Enter')) this.finish();
    if (this.edge('Escape')) this.setArmed(false);
    // Backspace remove o último ponto colocado.
    if (this.edge('Backspace') && this.points.length > 0) {
      this.points.pop();
      this.rebuildPreview();
    }
  }

  private finish(): void {
    if (this.points.length < 2) {
      this.hud.showToast('Estrada precisa de ao menos 2 pontos');
      return;
    }
    const node: SceneNode = {
      type: 'road',
      id: `road-${Date.now().toString(36)}`,
      nodes: this.points.map((p) => [p[0], p[1], p[2]] as Vec3),
      surface: 'asphalt',
      conformTerrain: true,
    };
    this.cleanup();
    this.armed = false;
    this.editorState.drawingShape = false;
    this.onCreate(node);
    this.hud.showToast('Estrada criada');
  }

  // ── Prévia (linha central da spline) ─────────────────────────────────────────────

  private rebuildPreview(): void {
    const pts = this.cursor && this.armed ? [...this.points, this.cursor] : this.points;
    if (pts.length < 2) {
      if (this.preview) this.preview.visible = false;
      return;
    }
    const samples = sampleSpline(pts, 10);
    const pos: number[] = [];
    for (const s of samples) pos.push(s.pos[0], s.pos[1] + 0.1, s.pos[2]);
    if (!this.preview) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffcc00, depthTest: false });
      this.preview = new THREE.Line(new THREE.BufferGeometry(), mat);
      this.preview.renderOrder = 999;
      this.preview.userData['editorInternal'] = true;
      this.three.add(this.preview);
    }
    this.preview.visible = true;
    this.preview.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.preview.geometry.computeBoundingSphere();
  }

  // ── Hover (próximo ponto) ─────────────────────────────────────────────────────────

  private showHover(): void {
    this.cleanupHover();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1000;
    ring.userData['editorInternal'] = true;
    this.hover = ring;
    this.three.add(ring);
  }

  private updateHover(p: Vec3): void {
    if (!this.hover) this.showHover();
    if (this.hover) this.hover.position.set(p[0], p[1] + 0.03, p[2]);
  }

  private cleanupHover(): void {
    if (!this.hover) return;
    this.three.remove(this.hover);
    this.hover.geometry.dispose();
    (this.hover.material as THREE.Material).dispose();
    this.hover = null;
  }

  private cleanup(): void {
    this.cleanupHover();
    if (this.preview) {
      this.three.remove(this.preview);
      this.preview.geometry.dispose();
      (this.preview.material as THREE.Material).dispose();
      this.preview = null;
    }
    this.points = [];
    this.cursor = null;
  }

  // ── Raycast no chão ──────────────────────────────────────────────────────────────

  private groundPoint(clientX: number, clientY: number): Vec3 {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(this.three.children, true)) {
      if (this.isInternal(hit.object)) continue;
      return [hit.point.x, hit.point.y, hit.point.z];
    }
    const out = new THREE.Vector3();
    this.plane.constant = 0;
    const hit = this.raycaster.ray.intersectPlane(this.plane, out);
    return hit ? [out.x, out.y, out.z] : [0, 0, 0];
  }

  private isInternal(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData['editorInternal'] === true) return true;
      cur = cur.parent;
    }
    return false;
  }

  private edge(key: string): boolean {
    const now = this.input.isKeyDown(key);
    const before = this.prev.get(key) ?? false;
    this.prev.set(key, now);
    return now && !before;
  }
}
