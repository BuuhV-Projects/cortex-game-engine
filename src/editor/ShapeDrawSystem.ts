import * as THREE from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Scene } from '../core/Scene.js';
import type { EditorState } from './EditorState.js';
import type { EditorHud } from './EditorHud.js';
import type { SceneNode } from '../scene/SceneDefinition.js';
import { loadGLB, instance } from '../scene/SceneAssets.js';

/** `[x, y, z]`. */
type V3 = [number, number, number];

/** Grade de snap (metros) — blockout em medidas limpas. O engine trabalha em metros. */
const GRID = 0.25;
const snap = (v: number): number => Math.round(v / GRID) * GRID;

/**
 * Calcula a **caixa** (posição do centro + dimensões) a partir de dois pontos no
 * chão (`p0`→`p1`, a base arrastada) e uma `height`. Função pura — testável. A base
 * fica no plano `y = p0[1]` (chão); o centro sobe `height/2`. Largura/profundidade
 * têm um mínimo pra não criar caixa degenerada.
 */
export function boxFromDrag(
  p0: V3,
  p1: V3,
  height: number,
): { position: V3; params: { width: number; height: number; depth: number } } {
  const minX = Math.min(p0[0], p1[0]);
  const maxX = Math.max(p0[0], p1[0]);
  const minZ = Math.min(p0[2], p1[2]);
  const maxZ = Math.max(p0[2], p1[2]);
  const width = Math.max(0.1, maxX - minX);
  const depth = Math.max(0.1, maxZ - minZ);
  const h = Math.max(0.1, height);
  const groundY = p0[1];
  return {
    position: [(minX + maxX) / 2, groundY + h / 2, (minZ + maxZ) / 2],
    params: { width, height: h, depth },
  };
}

/**
 * **Encaixa um modelo na caixa desenhada** (modo GLB do desenhar — SPEC-0093):
 * dado o bounding box NATIVO do modelo (escala 1) e a caixa desenhada
 * (centro + dimensões, base no chão), devolve `scale` por eixo e a `position`
 * do pivô que fazem o bbox do modelo preencher a caixa — base alinhada ao chão,
 * centrado em X/Z. Pura — testável.
 */
export function fitModelToBox(
  native: { min: V3; max: V3 },
  box: { position: V3; params: { width: number; height: number; depth: number } },
): { position: V3; scale: V3 } {
  const nw = Math.max(1e-4, native.max[0] - native.min[0]);
  const nh = Math.max(1e-4, native.max[1] - native.min[1]);
  const nd = Math.max(1e-4, native.max[2] - native.min[2]);
  const scale: V3 = [box.params.width / nw, box.params.height / nh, box.params.depth / nd];
  const groundY = box.position[1] - box.params.height / 2;
  const ncx = (native.min[0] + native.max[0]) / 2;
  const ncz = (native.min[2] + native.max[2]) / 2;
  return {
    position: [
      box.position[0] - ncx * scale[0], // centro X do bbox no centro da caixa
      groundY - native.min[1] * scale[1], // BASE do bbox no chão
      box.position[2] - ncz * scale[2],
    ],
    scale,
  };
}

/**
 * **Desenhar blockout** (ProBuilder "New Shape" — SPEC-0071). Fluxo igual ao do
 * Unity: arme o modo, **arraste no terreno** pra definir a base (retângulo no XZ),
 * **solte** e **mova o mouse pra cima/baixo** pra definir a altura, **clique** pra
 * confirmar. Cria um nó `mesh` (cubo) com a pose/tamanho desenhados — OU, com um
 * **modelo escolhido** ({@link ShapeDrawSystem.setModel}), um nó `model` com o
 * `.glb` **moldado à caixa** (escala por eixo; o preview do próprio modelo escala
 * AO VIVO durante o desenho — SPEC-0093).
 *
 * Enquanto desenha, `editorState.drawingShape = true` — o ObjectEditSystem e o
 * MeshEditSystem cedem o clique. `Esc` cancela. Mostra um preview translúcido.
 */
export class ShapeDrawSystem extends System {
  static override requiredComponents = [];
  override priority = 26; // antes do ObjectEditSystem (27)

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly three: THREE.Scene;

  private armed = false;
  private stage: 'idle' | 'base' | 'height' = 'idle';
  private p0: V3 = [0, 0, 0];
  private p1: V3 = [0, 0, 0];
  private height = 1;
  private anchorScreenY = 0;
  private preview: THREE.Mesh | null = null;
  private hover: THREE.Mesh | null = null;
  private readonly prev = new Map<string, boolean>();
  /** Modo modelo (SPEC-0093): url do `.glb` que o desenho molda (null = caixa). */
  private modelUrl: string | null = null;
  /** Preview vivo do modelo (escala junto do arrasto). */
  private modelPreview: THREE.Object3D | null = null;
  /** BBox nativo do modelo em escala 1 (pra calcular o encaixe). */
  private modelNative: { min: V3; max: V3 } | null = null;
  /** Sessão de desenho — invalida loads async de sessões canceladas. */
  private drawToken = 0;

  constructor(
    private readonly editorState: EditorState,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    scene: Scene,
    private readonly input: InputManager,
    private readonly hud: EditorHud,
    /** Cria o nó na cena (attachEditor: instancia + persiste no overlay + seleciona). */
    private readonly onCreate: (node: SceneNode) => void,
  ) {
    super();
    this.three = scene.getThreeScene();

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.armed || !this.editorState.active || e.button !== 0) return;
      if (this.stage === 'idle') {
        // Só INICIA a criação com CTRL segurado (modo persistente: o tool fica armado
        // pra criar vários, mas sem CTRL o clique não cria nada).
        if (!(e.ctrlKey || e.metaKey)) return;
        const g = this.groundPoint(e.clientX, e.clientY);
        this.p0 = [snap(g[0]), g[1], snap(g[2])]; // base no grid de metros (Y = chão real)
        this.p1 = [...this.p0];
        this.height = 1;
        this.stage = 'base';
        this.hideHover();
        this.showPreview();
      } else if (this.stage === 'height') {
        this.confirm();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.armed) return;
      if (this.stage === 'idle') {
        // Indicador de onde a criação vai começar (segue o cursor, no grid).
        const g = this.groundPoint(e.clientX, e.clientY);
        this.updateHover(snap(g[0]), g[1], snap(g[2]), e.ctrlKey || e.metaKey);
        return;
      }
      if (this.stage === 'base') {
        const g = this.groundPointOnPlane(e.clientX, e.clientY, this.p0[1]);
        this.p1 = [snap(g[0]), g[1], snap(g[2])];
      } else {
        // Altura por movimento vertical do mouse (pra cima = mais alto), escalada
        // pela distância à câmera pra ficar consistente em qualquer zoom, no grid.
        const dist = this.camera.position.distanceTo(this.centerVec());
        this.height = Math.max(GRID, snap((this.anchorScreenY - e.clientY) * 0.004 * dist));
      }
      this.updatePreview();
      this.showDims();
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this.armed || this.stage !== 'base' || e.button !== 0) return;
      // Base definida → passa pra altura (o próximo movimento puxa pra cima).
      this.stage = 'height';
      this.anchorScreenY = e.clientY;
      this.hud.showToast('Mova pra cima/baixo e clique pra confirmar a altura');
    });
  }

  /**
   * Define O QUE o desenho cria (SPEC-0093): `null` = caixa paramétrica (mesh);
   * uma URL `.glb` = nó `model` moldado à caixa desenhada (escala por eixo).
   */
  setModel(url: string | null): void {
    this.modelUrl = url;
    this.modelNative = null;
  }

  /** Liga/desliga o modo desenhar (persistente: cria vários com CTRL+arraste). */
  setArmed(on: boolean): void {
    this.armed = on;
    this.editorState.drawingShape = on;
    this.stage = 'idle';
    if (on) {
      this.showHover();
      const alvo = this.modelUrl ? this.modelUrl.split('/').pop() : 'caixa';
      this.hud.showToast(`Desenhar ${alvo}: CTRL + arraste pra base · Esc pra sair`);
    } else {
      this.cancel();
    }
  }

  get isArmed(): boolean {
    return this.armed;
  }

  override update(_entities: Entity[]): void {
    if (!this.editorState.active && this.armed) this.setArmed(false);
    if (this.armed && this.edge('Escape')) this.cancel();
  }

  private confirm(): void {
    const box = boxFromDrag(this.p0, this.p1, this.height);
    let node: SceneNode;
    if (this.modelUrl && this.modelNative) {
      // Modo modelo: nó `model` com o glb MOLDADO à caixa desenhada.
      const fit = fitModelToBox(this.modelNative, box);
      node = {
        type: 'model',
        id: `draw-${Date.now().toString(36)}`,
        url: this.modelUrl,
        transform: { position: fit.position, scale: fit.scale },
      } as SceneNode;
    } else {
      node = {
        type: 'mesh',
        id: `mesh-${Date.now().toString(36)}`,
        shape: { kind: 'cube', params: box.params },
        transform: { position: box.position },
      };
    }
    this.cleanupPreview();
    this.stage = 'idle';
    this.onCreate(node);
    // Permanece ARMADO pra criar outro (CTRL+arraste). Esc/botão sai.
    this.showHover();
    this.hud.showToast('Criada! CTRL + arraste pra outra · Esc pra sair');
  }

  private cancel(): void {
    this.cleanupPreview();
    this.cleanupHover();
    this.stage = 'idle';
    this.editorState.drawingShape = false;
    this.armed = false;
  }

  // ── Preview ────────────────────────────────────────────────────────────────────

  private showPreview(): void {
    this.cleanupPreview();
    const mat = new THREE.MeshBasicMaterial({ color: 0x33d2ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.preview = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    this.preview.userData['editorInternal'] = true;
    this.three.add(this.preview);
    // Modo modelo: carrega o glb (async) e mostra o PRÓPRIO modelo escalando
    // junto do arrasto (a caixa translúcida vira guia por cima). editorInternal:
    // o raycast do chão ignora o preview (senão a base "sobe" nele mesmo).
    if (this.modelUrl) {
      const url = this.modelUrl;
      const token = ++this.drawToken;
      void loadGLB(url).then((gltf) => {
        if (token !== this.drawToken || this.stage === 'idle' || url !== this.modelUrl) return;
        const obj = instance(gltf, {});
        obj.traverse((c) => (c.userData['editorInternal'] = true));
        obj.userData['editorInternal'] = true;
        const b = new THREE.Box3().setFromObject(obj);
        this.modelNative = { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
        this.modelPreview = obj;
        this.three.add(obj);
        this.updatePreview();
      });
    }
    this.updatePreview();
  }

  private updatePreview(): void {
    const box = boxFromDrag(this.p0, this.p1, this.height);
    if (this.preview) {
      this.preview.scale.set(box.params.width, box.params.height, box.params.depth);
      this.preview.position.set(box.position[0], box.position[1], box.position[2]);
      // Com o modelo visível, a caixa vira um guia bem sutil.
      (this.preview.material as THREE.MeshBasicMaterial).opacity = this.modelPreview ? 0.12 : 0.35;
    }
    if (this.modelPreview && this.modelNative) {
      const fit = fitModelToBox(this.modelNative, box);
      this.modelPreview.scale.set(fit.scale[0], fit.scale[1], fit.scale[2]);
      this.modelPreview.position.set(fit.position[0], fit.position[1], fit.position[2]);
    }
  }

  /** Mostra as dimensões em metros ao vivo (HUD). */
  private showDims(): void {
    const { params } = boxFromDrag(this.p0, this.p1, this.height);
    const m = (n: number): string => n.toFixed(2);
    this.hud.showToast(`${m(params.width)} × ${m(params.height)} × ${m(params.depth)} m`);
  }

  // ── Hover (onde a criação vai começar) ───────────────────────────────────────────

  private showHover(): void {
    this.cleanupHover();
    // Anel plano no chão + um ponto central — marca o canto/início da base.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 24),
      new THREE.MeshBasicMaterial({ color: 0x33d2ff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; // deita no plano XZ
    ring.renderOrder = 999;
    ring.userData['editorInternal'] = true;
    this.hover = ring;
    this.three.add(ring);
  }

  /** Reposiciona o hover no ponto do cursor; cor indica se CTRL está pronto pra criar. */
  private updateHover(x: number, y: number, z: number, ready: boolean): void {
    if (!this.hover) this.showHover();
    if (!this.hover) return;
    this.hover.visible = true;
    this.hover.position.set(x, y + 0.02, z); // leve offset pra não z-fightar com o chão
    const mat = this.hover.material as THREE.MeshBasicMaterial;
    mat.color.setHex(ready ? 0x6ad36a : 0x33d2ff); // verde = CTRL segurado (vai criar)
  }

  private hideHover(): void {
    if (this.hover) this.hover.visible = false;
  }

  private cleanupHover(): void {
    if (!this.hover) return;
    this.three.remove(this.hover);
    this.hover.geometry.dispose();
    (this.hover.material as THREE.Material).dispose();
    this.hover = null;
  }

  private cleanupPreview(): void {
    this.drawToken++; // invalida loads async pendentes da sessão
    if (this.modelPreview) {
      this.three.remove(this.modelPreview);
      this.modelPreview = null;
    }
    if (!this.preview) return;
    this.three.remove(this.preview);
    this.preview.geometry.dispose();
    (this.preview.material as THREE.Material).dispose();
    this.preview = null;
  }

  private centerVec(): THREE.Vector3 {
    const { position } = boxFromDrag(this.p0, this.p1, this.height);
    return new THREE.Vector3(position[0], position[1], position[2]);
  }

  // ── Raycast no chão ──────────────────────────────────────────────────────────────

  /** Ponto onde o cursor acerta a CENA (terreno) — fallback no plano y=0. */
  private groundPoint(clientX: number, clientY: number): V3 {
    this.setRay(clientX, clientY);
    for (const hit of this.raycaster.intersectObjects(this.three.children, true)) {
      if (this.isInternal(hit.object)) continue;
      return [hit.point.x, hit.point.y, hit.point.z];
    }
    return this.groundPointOnPlane(clientX, clientY, 0);
  }

  /** Ponto do cursor no plano horizontal `y = planeY` (pra estender a base livremente). */
  private groundPointOnPlane(clientX: number, clientY: number, planeY: number): V3 {
    this.setRay(clientX, clientY);
    this.groundPlane.constant = -planeY;
    const out = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, out);
    return hit ? [out.x, out.y, out.z] : [this.p0[0], planeY, this.p0[2]];
  }

  private setRay(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
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
