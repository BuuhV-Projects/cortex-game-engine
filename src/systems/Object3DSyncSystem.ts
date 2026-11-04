import type { Object3D } from 'three';
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
 * Garante `rotation.order = 'YXZ'`: assim o yaw (`rotation.y`) é aplicado
 * primeiro e pitch/roll (`rotation.x`/`.z`) — que outros sistemas (ex.:
 * conformação ao terreno do jogo) aplicam direto no `Object3D` — ficam "locais"
 * à entidade já virada. Corrige a ordem se algo a trocou.
 *
 * Só escreve o que difere do transform (SPEC-0673): cada setter de `Euler`
 * recalcula o quaternion (`sin`/`cos`), e a maioria das entidades (colisores
 * estáticos, carros dormindo) não se move. O resultado é o mesmo de escrever
 * sempre — inclusive para quem escreve direto em `transform.x` ou no `Object3D`.
 */
export class Object3DSyncSystem extends System {
  override readonly profileLabel = 'Object3DSyncSystem';
  static override requiredComponents = [TransformComponent, Object3DComponent];
  override priority = 10;

  /** Array de entidades do último quadro; os pares abaixo valem para ele. */
  private _source: Entity[] | null = null;
  private readonly _transforms: TransformComponent[] = [];
  private readonly _objects: Object3DComponent[] = [];

  override update(entities: Entity[]): void {
    // O World reusa o mesmo array enquanto a estrutura do ECS não muda: refaz os
    // pares (sem os dois Map.get por entidade) só quando ele troca.
    if (entities !== this._source || entities.length !== this._transforms.length) this._rebuild(entities);
    const transforms = this._transforms;
    const objects = this._objects;
    for (let i = 0; i < transforms.length; i++) {
      syncOne(transforms[i]!, objects[i]!.object);
    }
  }

  private _rebuild(entities: Entity[]): void {
    this._source = entities;
    this._transforms.length = entities.length;
    this._objects.length = entities.length;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]!;
      this._transforms[i] = entity.getComponent(TransformComponent)!;
      this._objects[i] = entity.getComponent(Object3DComponent)!;
    }
  }
}

/** Copia o transform para o objeto, escrevendo só o que mudou. */
function syncOne(t: TransformComponent, obj: Object3D): void {
  const p = obj.position;
  if (p.x !== t.x || p.y !== t.y || p.z !== t.z) p.set(t.x, t.y, t.z);
  const r = obj.rotation;
  if (r.order !== 'YXZ') r.order = 'YXZ';
  if (r.y !== t.rotationY) r.y = t.rotationY;
}
