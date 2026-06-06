import {
  LineLoop,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  Group,
  type Object3D,
} from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import type { EditorState } from './EditorState.js';

// Cores do contorno por tipo de collider (RGB hex). Verde = sólido (chão/parede),
// âmbar = one-way (plataforma atravessável por baixo), azul = não-sólido
// (player/gatilhos — não é parede).
const COLOR_SOLID = 0x3ad17a;
const COLOR_ONEWAY = 0xf5a623;
const COLOR_TRIGGER = 0x4aa3ff;

function colorFor(col: Collider2DComponent): number {
  if (col.oneWay) return COLOR_ONEWAY;
  if (!col.solid) return COLOR_TRIGGER;
  return COLOR_SOLID;
}

interface Gizmo {
  loop: LineLoop;
  hw: number;
  hh: number;
}

/**
 * Desenha o **contorno (AABB) de cada `Collider2DComponent`** como um retângulo
 * no plano XY — visível só no **modo editor** (F2). Mostra a hitbox real usada
 * pela física (as meias-extensões fixas do componente, **não** a escala do mesh),
 * então dá pra ver/ajustar colisões mesmo quando o collider difere do visual.
 *
 * Cores: verde = sólido, âmbar = one-way, azul = não-sólido (player/gatilho). As
 * linhas ignoram profundidade (`depthTest: false`) e têm `renderOrder` alto, então
 * aparecem por cima da geometria. Vive só no bundle de dev (não é exportado pelo
 * runtime); registrado pelo `attachEditor`.
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
        this.group.add(g.loop);
      } else if (g.hw !== col.halfWidth || g.hh !== col.halfHeight) {
        // Tamanho do collider mudou — reconstrói a geometria do retângulo.
        this.setRect(g, col.halfWidth, col.halfHeight);
      }

      // Posição = centro do collider = o TransformComponent da entidade (é o que
      // a física usa). Vale tanto pro collider acoplado ao mesh (Object3D
      // sincronizado ao Transform) quanto pro DESACOPLADO (só Transform, sem
      // Object3D — padrão comum pra pivô descentralizado / collider != visual).
      const t = e.getComponent(TransformComponent)!;
      g.loop.position.set(t.x, t.y, t.z);

      const mat = g.loop.material as LineBasicMaterial;
      mat.color.setHex(colorFor(col));
    }

    // Remove gizmos de entidades que sumiram (delete no editor, etc.).
    for (const [e, g] of this.gizmos) {
      if (seen.has(e)) continue;
      this.group.remove(g.loop);
      g.loop.geometry.dispose();
      (g.loop.material as LineBasicMaterial).dispose();
      this.gizmos.delete(e);
    }
  }

  private makeGizmo(col: Collider2DComponent): Gizmo {
    const geometry = new BufferGeometry();
    const material = new LineBasicMaterial({
      color: colorFor(col),
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const loop = new LineLoop(geometry, material);
    loop.renderOrder = 999; // por cima da cena
    const g: Gizmo = { loop, hw: 0, hh: 0 };
    this.setRect(g, col.halfWidth, col.halfHeight);
    return g;
  }

  /** Atualiza os 4 cantos do retângulo (plano XY) com as meias-extensões dadas. */
  private setRect(g: Gizmo, hw: number, hh: number): void {
    // 4 cantos em sentido horário; LineLoop fecha o último → primeiro.
    const verts = [-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0];
    g.loop.geometry.setAttribute('position', new Float32BufferAttribute(verts, 3));
    g.loop.geometry.computeBoundingSphere();
    g.hw = hw;
    g.hh = hh;
  }
}
