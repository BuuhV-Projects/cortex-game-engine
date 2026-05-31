import { Component } from '../ecs/Component.js';

/**
 * Estado cinemático de uma entidade movida por raycast (não por impulso).
 *
 * Usado pelos sistemas de `src/physics/` (gravidade + ground-snap, colisão
 * lateral). É a generalização do antigo acoplamento a `VehicleComponent`
 * (`velocityY` / `grounded` / `speed`), pra que qualquer entidade — não só
 * veículos — possa cair, grudar no chão e raspar em paredes.
 *
 * Diferente do `RigidBodyComponent` (src/core/Physics.ts), que é resolvido
 * por impulso/AABB. Os dois podem coexistir em entidades distintas.
 */
export class KinematicBodyComponent extends Component {
  /** Velocidade vertical em unidades/s. Positivo = subindo. Integrada pela gravidade. */
  velocityY = 0;

  /** `true` quando o último ground-snap encostou a entidade no chão. */
  grounded = false;

  /** Velocidade horizontal em unidades/s, no eixo do heading (`TransformComponent.rotationY`). */
  horizontalSpeed = 0;
}
