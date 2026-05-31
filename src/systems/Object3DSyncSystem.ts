import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';

/**
 * Sincroniza `TransformComponent` → `Object3D.position` / `rotation.y`.
 *
 * Roda depois da movimentação/física (priority 10) pra garantir que o frame
 * renderizado reflita o estado lógico atualizado.
 *
 * Seta `rotation.order = 'YXZ'` a cada frame de propósito: assim o yaw
 * (`rotation.y`) é aplicado primeiro e pitch/roll (`rotation.x`/`.z`) — que
 * outros sistemas (ex.: conformação ao terreno do jogo) aplicam direto no
 * `Object3D` — ficam "locais" à entidade já virada. Setar toda frame protege
 * contra algo que tenha trocado a ordem.
 */
export class Object3DSyncSystem extends System {
  static override requiredComponents = [TransformComponent, Object3DComponent];
  override priority = 10;

  override update(entities: Entity[]): void {
    for (const entity of entities) {
      const transform = entity.getComponent(TransformComponent)!;
      const obj = entity.getComponent(Object3DComponent)!.object;
      obj.position.set(transform.x, transform.y, transform.z);
      obj.rotation.order = 'YXZ';
      obj.rotation.y = transform.rotationY;
    }
  }
}
