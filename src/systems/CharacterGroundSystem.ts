import { Raycaster, Vector3, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';

const _origin = new Vector3();
const _down = new Vector3(0, -1, 0);

/**
 * **Chão por raycast** pra o {@link CharacterBodyComponent} — o personagem manda um
 * raio pra BAIXO e fica EM CIMA do primeiro mesh abaixo dele (terreno, tiles
 * hexagonais, plataformas, qualquer geometria). Assim o chão é o próprio mesh, sem
 * precisar marcar collider em cada objeto (modelo estilo UPBGE). `stepHeight`
 * permite subir degraus pequenos andando. Aterra (zera `velocityY`, marca
 * `grounded`, reseta pulos).
 *
 * Precisa das **raízes da cena** pra testar (`new CharacterGroundSystem([scene]))`;
 * ignora o próprio mesh do personagem. Roda depois da física (priority 7).
 */
export class CharacterGroundSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 7;
  private readonly raycaster = new Raycaster();

  constructor(private readonly roots: Object3D[]) {
    super();
  }

  override update(entities: Entity[]): void {
    for (const e of entities) {
      const t = e.getComponent(TransformComponent)!;
      const c = e.getComponent(CharacterBodyComponent)!;
      const self = e.getComponent(Object3DComponent)?.object ?? null;

      // Origem um pouco acima dos pés (pra detectar degraus até stepHeight).
      _origin.set(t.x, t.y + c.stepHeight + 0.1, t.z);
      this.raycaster.set(_origin, _down);
      this.raycaster.far = c.stepHeight + 1.2; // alcance: degrau + queda do frame

      const hits = this.raycaster.intersectObjects(this.roots, true);
      let groundY: number | null = null;
      for (const h of hits) {
        if (self && isDescendant(h.object, self)) continue; // ignora o próprio personagem
        groundY = h.point.y;
        break;
      }
      if (groundY === null) continue; // nada embaixo no alcance → continua caindo

      // Pés no/abaixo do chão (ou degrau até stepHeight) → assenta em cima.
      if (t.y <= groundY + 0.02) {
        t.y = groundY;
        if (c.velocityY < 0) c.velocityY = 0;
        c.grounded = true;
        c.jumpsUsed = 0;
      }
    }
  }
}

function isDescendant(obj: Object3D, ancestor: Object3D): boolean {
  let o: Object3D | null = obj;
  while (o) {
    if (o === ancestor) return true;
    o = o.parent;
  }
  return false;
}
