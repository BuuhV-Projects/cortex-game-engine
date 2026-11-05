import * as THREE from 'three';
import { Component } from '../ecs/Component.js';
import type { Entity } from '../ecs/Entity.js';
import type { World } from '../ecs/World.js';

/**
 * Liga uma entidade ao seu `Object3D` (Mesh/Group) na cena Three.js.
 *
 * O `Object3DSyncSystem` copia o `TransformComponent` da entidade para
 * `object.position` / `object.rotation.y` a cada frame — exceto quando ela está
 * congelada (SPEC-0684, ver {@link Object3DComponent.frozen}).
 */
export class Object3DComponent extends Component {
  /**
   * Fora do laço do `Object3DSyncSystem` (SPEC-0684): o transform não é mais copiado
   * para o objeto. O `mergeStaticScene` congela as entidades estáticas cuja arte
   * fundiu. Não escreva direto: use `Object3DSyncSystem.freeze`/`unfreeze`, que
   * sincronizam e avisam o sistema.
   */
  frozen = false;

  /**
   * `entity.componentsVersion` no momento do congelamento: o sync só confere de novo
   * os tipos dos componentes quando ela muda.
   * @internal
   */
  frozenComponentsVersion = -1;

  constructor(public object: THREE.Object3D) {
    super();
    ecsBoundObjects.add(object);
  }
}

/**
 * Objetos que já foram ligados a uma entidade por um {@link Object3DComponent}
 * (Character, Collider2D, Rapier…). O hot reload de GLB (SPEC-0697) pula essas raízes:
 * bbox, corpo e collider derivam da geometria. Não sai ao destruir a entidade.
 * @internal
 */
export const ecsBoundObjects = new WeakSet<THREE.Object3D>();

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
