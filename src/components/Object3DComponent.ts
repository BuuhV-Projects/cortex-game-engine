import * as THREE from 'three';
import { Component } from '../ecs/Component.js';
import type { Entity } from '../ecs/Entity.js';
import type { World } from '../ecs/World.js';

/**
 * Liga uma entidade ao seu `Object3D` (Mesh/Group) na cena Three.js.
 *
 * O `Object3DSyncSystem` copia o `TransformComponent` da entidade para
 * `object.position` / `object.rotation.y` a cada frame.
 */
export class Object3DComponent extends Component {
  constructor(public object: THREE.Object3D) {
    super();
  }
}

/**
 * **Entidade pelo NOME do objeto de cena.** O `buildScene` nomeia cada `Object3D`
 * com o `id` do nó (declarado no código/JSON, ou gerado — `add-…` — quando o
 * objeto é arrastado pro viewport no editor), então o nome é o identificador
 * estável de um objeto da cena. Use quando um query por componentes for ambíguo
 * (vários personagens/NPCs) e você precisa de UM objeto específico.
 *
 * Convenção de nome: **alfanumérico, hífen e underline** (`[A-Za-z0-9_-]`),
 * sem espaço — ids gerados pelo editor já seguem isso.
 *
 * @example
 * // num ScriptBehavior: acha o boss entre vários characters
 * const boss = entityByObjectName(this.ctx.world, 'boss-1')
 * const t = boss?.getComponent(TransformComponent)
 */
export function entityByObjectName(world: World, name: string): Entity | null {
  for (const e of world.query(Object3DComponent)) {
    const obj = e.getComponent(Object3DComponent)!.object;
    if (obj.name === name || obj.getObjectByName(name)) return e;
  }
  return null;
}
