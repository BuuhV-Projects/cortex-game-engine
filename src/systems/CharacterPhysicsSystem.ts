import { Raycaster, Vector3, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';

const DOWN = new Vector3(0, -1, 0);
/** Tolerância de contato (skin width) — folga p/ considerar "tocando o chão". */
const SKIN = 0.05;

/** `obj` está sob `root` (é ele ou descendente)? Pra ignorar o próprio mesh. */
function isUnder(obj: Object3D, root: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Física vertical do {@link CharacterBodyComponent} (character controller estilo
 * UPBGE/Unity): aplica **gravidade** (limitada por `fallSpeedMax`), processa o
 * **pulo** (`jumpForce` até `maxJumps`), integra o Y e **aterra por COLISÃO** —
 * tudo no **mesmo tick** (sem oscilar/tremer).
 *
 * **Chão (estável):**
 * - **Colisão real (tipo Unity):** se receber as raízes da cena, faz um **raycast
 *   pra baixo** sob os pés e pousa na **geometria real** (terreno, tiles,
 *   plataformas) em qualquer altura — sobe degraus até `stepHeight`, ignora o
 *   próprio mesh. Só aterra **caindo** (velocidade ≤ 0) e quando os pés alcançam a
 *   superfície (curta distância por frame), então não "gruda" no ar nem treme.
 * - **Piso plano `groundY` (fallback):** rede de segurança — se não houver
 *   geometria embaixo, aterra nessa altura (não cai no vazio). Default `-Infinity`.
 *
 * O movimento horizontal (X/Z ou X/Y) fica com o input do jogo; o sistema cuida do
 * Y. Pivô nos **pés** (`transform.y` = base). Roda na física (priority 5).
 *
 * @example
 * // com colisão real (recomendado): passe as raízes da cena
 * world.addSystem(new CharacterPhysicsSystem([game.scene.getThreeScene()]))
 * // sem colisão (só piso plano via CharacterBody.groundY):
 * world.addSystem(new CharacterPhysicsSystem())
 */
export class CharacterPhysicsSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 5;

  private readonly roots: Object3D[];
  private readonly ray = new Raycaster();
  private readonly origin = new Vector3();

  /** @param roots Raízes da cena pra colisão de chão (raycast). Vazio = só `groundY`. */
  constructor(roots: Object3D[] = []) {
    super();
    this.roots = roots;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    for (const e of entities) {
      const t = e.getComponent(TransformComponent)!;
      const c = e.getComponent(CharacterBodyComponent)!;

      if (c.jumpQueued && c.jumpsUsed < c.maxJumps) {
        c.velocityY = c.jumpForce;
        c.jumpsUsed++;
        c.grounded = false;
      }
      c.jumpQueued = false;

      c.velocityY -= c.gravity * dt;
      if (c.velocityY < -c.fallSpeedMax) c.velocityY = -c.fallSpeedMax;
      t.y += c.velocityY * dt;
      c.grounded = false;

      // Altura do chão sob os pés. A GEOMETRIA REAL (raycast) VENCE: acha a primeira
      // superfície abaixo (a qualquer distância — ele cai de qualquer altura e pousa
      // nela). O piso plano `groundY` é só FALLBACK, usado quando NÃO há nada embaixo
      // (rede de segurança) — nunca sobrepõe o chão real.
      let groundHeight = -Infinity;
      if (this.roots.length > 0 && c.velocityY <= 0) {
        // Origem um pouco ACIMA dos pés (até `stepHeight`) pra subir degraus.
        this.origin.set(t.x, t.y + c.stepHeight + SKIN, t.z);
        this.ray.set(this.origin, DOWN);
        this.ray.far = Infinity;
        const self = e.getComponent(Object3DComponent)?.object;
        const hits = this.ray.intersectObjects(this.roots, true);
        for (const h of hits) {
          if (self && isUnder(h.object, self)) continue;
          if (h.object.userData?.['editorInternal']) continue;
          groundHeight = h.point.y; // 1ª superfície válida (a mais próxima abaixo da origem)
          break;
        }
      }
      if (groundHeight === -Infinity) groundHeight = c.groundY; // sem geometria → piso de segurança

      // Aterra (mesmo tick → sem oscilar): caindo e com os pés no/abaixo do chão.
      if (c.velocityY <= 0 && groundHeight > -Infinity && t.y <= groundHeight + SKIN) {
        t.y = groundHeight;
        c.velocityY = 0;
        c.grounded = true;
        c.jumpsUsed = 0;
      }
    }
  }
}
