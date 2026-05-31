import { Component } from '../ecs/Component.js';

/**
 * Marcador: a câmera de perseguição (`ThirdPersonCameraSystem`) segue a
 * entidade que tiver este componente. Espera-se no máximo uma por cena.
 */
export class FollowCameraTargetComponent extends Component {}
