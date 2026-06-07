import {
  Mesh,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  DoubleSide,
  Group,
  type Object3D,
} from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import type { EditorState } from './EditorState.js';

// Cores do contorno por tipo de collider (RGB hex). **Azul = sólido** (chão/parede
// — o caso comum, alto contraste contra cenários verdes), âmbar = one-way
// (atravessável por baixo), ciano = não-sólido (player/gatilho).
const COLOR_SOLID = 0x2a9dff;
const COLOR_ONEWAY = 0xf5a623;
const COLOR_TRIGGER = 0x28e0e0;

function colorFor(col: Collider2DComponent): number {
  if (col.oneWay) return COLOR_ONEWAY;
  if (!col.solid) return COLOR_TRIGGER;
  return COLOR_SOLID;
}

/** Índices das 8 triângulos do "frame" (anel retangular): 4 bordas × 2 tris. */
// prettier-ignore
const FRAME_INDICES = [
  0, 1, 5, 0, 5, 4, // base
  1, 2, 6, 1, 6, 5, // direita
  2, 3, 7, 2, 7, 6, // topo
  3, 0, 4, 3, 4, 7, // esquerda
];

interface Gizmo {
  mesh: Mesh;
  hw: number;
  hh: number;
}

/**
 * Desenha o **contorno (AABB) de cada `Collider2DComponent`** como um **frame
 * retangular** no plano XY — visível só no **modo editor** (F2). Mostra a hitbox
 * REAL usada pela física (`Transform + offset`, as meias-extensões do componente,
 * **não** a escala do mesh), então dá pra ver o formato do collider e se ele
 * casa ou não com o mesh.
 *
 * É um **mesh** (não linha): renderiza de forma robusta no WebGPU e tem espessura
 * de borda controlável (linhas finas somem em cenário cheio). Cores: azul =
 * sólido, âmbar = one-way, ciano = não-sólido. Ignora profundidade
 * (`depthTest: false`) + `renderOrder` alto → aparece por cima da geometria. Vive
 * só no bundle de dev; registrado pelo `attachEditor`.
 */
export class ColliderGizmoSystem extends System {
  static override requiredComponents = [Collider2DComponent, TransformComponent];
  // Depois da física/sync (priority baixa deles), pra ler a posição já atualizada.
  override priority = 200;

  private readonly group = new Group();
  private readonly gizmos = new Map<Entity, Gizmo>();

  constructor(
    private readonly state: EditorState,
    parent: Object3D,
  ) {
    super();
    this.group.name = '__editor_collider_gizmos';
    parent.add(this.group);
  }

  override update(entities: Entity[]): void {
    const active = this.state.active;
    this.group.visible = active;
    if (!active) return;

    const seen = new Set<Entity>();
    for (const e of entities) {
      seen.add(e);
      const col = e.getComponent(Collider2DComponent)!;
      let g = this.gizmos.get(e);
      if (!g) {
        g = this.makeGizmo(col);
        this.gizmos.set(e, g);
        this.group.add(g.mesh);
      } else if (g.hw !== col.halfWidth || g.hh !== col.halfHeight) {
        // Tamanho do collider mudou — reconstrói a geometria do frame.
        this.setRect(g, col.halfWidth, col.halfHeight);
      }

      // Centro do collider = Transform + offset (é o que a física usa). Vale pro
      // collider acoplado E pro desacoplado; o offset deixa o frame na sub-região
      // real (deck/pivô), não no centro do objeto.
      const t = e.getComponent(TransformComponent)!;
      g.mesh.position.set(t.x + col.offsetX, t.y + col.offsetY, t.z);

      (g.mesh.material as MeshBasicMaterial).color.setHex(colorFor(col));
    }

    // Remove gizmos de entidades que sumiram (delete no editor, etc.).
    for (const [e, g] of this.gizmos) {
      if (seen.has(e)) continue;
      this.group.remove(g.mesh);
      g.mesh.geometry.dispose();
      (g.mesh.material as MeshBasicMaterial).dispose();
      this.gizmos.delete(e);
    }
  }

  private makeGizmo(col: Collider2DComponent): Gizmo {
    const geometry = new BufferGeometry();
    geometry.setIndex(FRAME_INDICES);
    const material = new MeshBasicMaterial({
      color: colorFor(col),
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 999; // por cima da cena
    const g: Gizmo = { mesh, hw: 0, hh: 0 };
    this.setRect(g, col.halfWidth, col.halfHeight);
    return g;
  }

  /**
   * (Re)constrói o frame retangular (plano XY) com as meias-extensões dadas. O
   * frame é o anel entre o retângulo externo (hw, hh) e o interno (hw-t, hh-t),
   * com espessura `t` proporcional ao collider (visível em qualquer escala).
   */
  private setRect(g: Gizmo, hw: number, hh: number): void {
    const t = Math.min(Math.max(Math.min(hw, hh) * 0.08, 0.03), 0.25);
    const ix = Math.max(hw - t, 0);
    const iy = Math.max(hh - t, 0);
    // 0-3 = cantos externos (BL, BR, TR, TL); 4-7 = internos (mesma ordem).
    // prettier-ignore
    const verts = [
      -hw, -hh, 0,   hw, -hh, 0,   hw, hh, 0,   -hw, hh, 0,
      -ix, -iy, 0,   ix, -iy, 0,   ix, iy, 0,   -ix, iy, 0,
    ];
    g.mesh.geometry.setAttribute('position', new Float32BufferAttribute(verts, 3));
    g.mesh.geometry.computeBoundingSphere();
    g.hw = hw;
    g.hh = hh;
  }
}
