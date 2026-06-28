import {
  LineSegments,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  type Object3D,
} from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import type { EditorState } from './EditorState.js';

/** Verde estilo Unity Character Controller (cápsula do player/NPC). */
const COLOR = 0x46d160;

interface Gizmo {
  obj: LineSegments;
  radius: number;
  height: number;
}

/**
 * Desenha a **cápsula 3D** de cada {@link CharacterBodyComponent} (player/NPC) como
 * um **contorno de linhas** verde — estilo o gizmo do Character Controller da Unity
 * (2 anéis + 4 verticais + arcos das calotas, limpo, sem triangulação). Mostra a
 * hitbox REAL da física (raio + altura, ancorada nos pés via `footOffset`). É
 * **puramente visual**: `raycast` desligado (não é clicável) e `editorInternal`
 * (fora do outliner/export/seleção). Visível só no **modo editor** (F2). Vive só no
 * bundle de dev (registrado pelo `attachEditor`).
 */
export class CharacterColliderGizmoSystem extends System {
  static override requiredComponents = [CharacterBodyComponent, TransformComponent];
  override priority = 200;

  private readonly group = new Group();
  private readonly gizmos = new Map<Entity, Gizmo>();

  constructor(
    private readonly state: EditorState,
    parent: Object3D,
  ) {
    super();
    this.group.name = '__editor_character_gizmos';
    this.group.userData['editorInternal'] = true;
    parent.add(this.group);
  }

  override update(entities: Entity[]): void {
    const active = this.state.active;
    this.group.visible = active;
    if (!active) return;

    const seen = new Set<Entity>();
    for (const e of entities) {
      seen.add(e);
      const body = e.getComponent(CharacterBodyComponent)!;
      let g = this.gizmos.get(e);
      if (!g) {
        g = this.makeGizmo(body);
        this.gizmos.set(e, g);
        this.group.add(g.obj);
      } else if (g.radius !== body.radius || g.height !== body.height) {
        g.obj.geometry.dispose();
        g.obj.geometry = capsuleLines(body.radius, body.height);
        g.radius = body.radius;
        g.height = body.height;
      }

      // Cápsula ancorada nos pés (`transform.y − footOffset`); centro meia altura acima.
      const t = e.getComponent(TransformComponent)!;
      const feetY = t.y - body.footOffset;
      g.obj.position.set(t.x, feetY + body.height / 2, t.z);
    }

    for (const [e, g] of this.gizmos) {
      if (seen.has(e)) continue;
      this.group.remove(g.obj);
      g.obj.geometry.dispose();
      (g.obj.material as LineBasicMaterial).dispose();
      this.gizmos.delete(e);
    }
  }

  private makeGizmo(body: CharacterBodyComponent): Gizmo {
    const material = new LineBasicMaterial({
      color: COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const obj = new LineSegments(capsuleLines(body.radius, body.height), material);
    obj.renderOrder = 998;
    obj.raycast = () => {}; // puramente visual — nunca intercepta cliques
    obj.userData['editorInternal'] = true;
    return { obj, radius: body.radius, height: body.height };
  }
}

/**
 * Contorno de cápsula (origem no centro, eixo Y) como pares de segmentos: 2 anéis no
 * topo/base do cilindro, 4 verticais e 2 arcos por calota — limpo (sem diagonais).
 */
function capsuleLines(r: number, h: number): BufferGeometry {
  const cyl = Math.max(h / 2 - r, 0); // meia-altura do cilindro
  const v: number[] = [];
  const SEG = 24;

  const ring = (y: number): void => {
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const b = ((i + 1) / SEG) * Math.PI * 2;
      v.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r);
    }
  };
  ring(cyl);
  ring(-cyl);

  // 4 verticais conectando os anéis.
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    v.push(x, cyl, z, x, -cyl, z);
  }

  // Arcos das calotas (2 planos: XY e ZY), do anel ao polo.
  const ARC = 8;
  const cap = (yBase: number, dir: 1 | -1): void => {
    for (let i = 0; i < ARC; i++) {
      const a0 = (i / ARC) * (Math.PI / 2);
      const a1 = ((i + 1) / ARC) * (Math.PI / 2);
      const r0 = Math.cos(a0) * r;
      const r1 = Math.cos(a1) * r;
      const y0 = yBase + dir * Math.sin(a0) * r;
      const y1 = yBase + dir * Math.sin(a1) * r;
      v.push(r0, y0, 0, r1, y1, 0, -r0, y0, 0, -r1, y1, 0); // plano XY (2 lados)
      v.push(0, y0, r0, 0, y1, r1, 0, y0, -r0, 0, y1, -r1); // plano ZY (2 lados)
    }
  };
  cap(cyl, 1);
  cap(-cyl, -1);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  return g;
}
