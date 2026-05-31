import * as THREE from 'three';
import { Component } from '../ecs/Component.js';

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
