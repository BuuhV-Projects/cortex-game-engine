import {
  Mesh,
  CapsuleGeometry,
  MeshBasicMaterial,
  DoubleSide,
  Group,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import type { EditorState } from './EditorState.js';

/** Verde estilo Unity Character Controller (cápsula do player/NPC). */
const COLOR = 0x46d160;

interface Gizmo {
  mesh: Mesh;
  radius: number;
  height: number;
}

/**
 * Desenha a **cápsula 3D** de cada {@link CharacterBodyComponent} (player/NPC) como
 * um wireframe verde — estilo o gizmo do Character Controller da Unity. Mostra a
 * hitbox REAL da física (raio + altura, ancorada nos pés via `footOffset`), pra ver
 * se a cápsula casa com o modelo. Visível só no **modo editor** (F2). Ignora
 * profundidade (aparece por cima) e vive só no bundle de dev (registrado pelo
 * `attachEditor`). Diferente do {@link ColliderGizmoSystem} (frames 2D de
 * `Collider2DComponent`), este é a cápsula 3D do character.
 */
export class CharacterColliderGizmoSystem extends System {
  static override requiredComponents = [CharacterBodyComponent, TransformComponent];
  // Depois da física/sync, pra ler a posição já atualizada.
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
        this.group.add(g.mesh);
      } else if (g.radius !== body.radius || g.height !== body.height) {
        g.mesh.geometry.dispose();
        g.mesh.geometry = capsuleGeometry(body);
        g.radius = body.radius;
        g.height = body.height;
      }

      // Cápsula ancorada nos pés (`transform.y − footOffset`); o centro fica meia
      // altura acima. X/Z seguem o personagem.
      const t = e.getComponent(TransformComponent)!;
      const feetY = t.y - body.footOffset;
      g.mesh.position.set(t.x, feetY + body.height / 2, t.z);

      // Proxy de CLIQUE: o raycast do editor erra a malha skinada (bounding na
      // bind-pose); então clicar na cápsula seleciona o PRÓPRIO personagem.
      const owner = e.getComponent(Object3DComponent)?.object;
      if (owner) g.mesh.userData['cortexPickProxy'] = owner;
    }

    // Limpa gizmos de entidades que sumiram.
    for (const [e, g] of this.gizmos) {
      if (seen.has(e)) continue;
      this.group.remove(g.mesh);
      g.mesh.geometry.dispose();
      (g.mesh.material as MeshBasicMaterial).dispose();
      this.gizmos.delete(e);
    }
  }

  private makeGizmo(body: CharacterBodyComponent): Gizmo {
    const material = new MeshBasicMaterial({
      color: COLOR,
      wireframe: true,
      depthTest: false,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide, // raycast de clique pega a cápsula de qualquer face (proxy)
    });
    const mesh = new Mesh(capsuleGeometry(body), material);
    mesh.renderOrder = 998;
    mesh.userData['editorInternal'] = true;
    return { mesh, radius: body.radius, height: body.height };
  }
}

/** Geometria de cápsula casando com o `CharacterBody` (altura total = cilindro + 2·raio). */
function capsuleGeometry(body: CharacterBodyComponent): BufferGeometry {
  const cylLen = Math.max(body.height - 2 * body.radius, 0.01);
  return new CapsuleGeometry(body.radius, cylLen, 6, 16);
}
