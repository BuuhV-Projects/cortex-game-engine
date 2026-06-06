import { Component } from '../ecs/Component.js';

/**
 * Corpo de plataforma (o "ator" que se move): velocidade no plano XY, estado de
 * chão, e a **intenção** de movimento (preenchida por um sistema de input ou
 * pela IA a cada frame). O {@link PlatformerPhysicsSystem} integra gravidade,
 * movimento e colisão AABB. Tunables de plataformer (pulo/gravidade) ficam aqui.
 *
 * Convenção: Y para cima (pulo = `vy` positivo; gravidade reduz `vy`).
 */
export class PlatformerBodyComponent extends Component {
  /** Velocidade horizontal (X), unidades/seg. Derivada de `moveDir`. */
  vx = 0;
  /** Velocidade vertical (Y), unidades/seg. */
  vy = 0;
  /** `true` se está apoiado no chão neste frame. */
  grounded = false;

  /** Intenção horizontal: -1 (esquerda), 0, 1 (direita). */
  moveDir = 0;
  /** Intenção de pulo neste frame (consumida pelo sistema). */
  jumpQueued = false;

  constructor(
    /** Velocidade de corrida (unidades/seg). */
    public moveSpeed = 8,
    /** Velocidade inicial do pulo (unidades/seg). */
    public jumpSpeed = 14,
    /** Aceleração da gravidade (unidades/seg²). */
    public gravity = 40,
    /** Velocidade de queda máxima (terminal). */
    public maxFall = 25,
  ) {
    super();
  }
}
