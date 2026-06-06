import { Component } from '../ecs/Component.js';

/**
 * Caixa de colisão AABB no plano **XY** (plataforma 2.5D), centrada na posição
 * do {@link TransformComponent} da entidade **+ um offset** (`offsetX`/`offsetY`).
 * `solid` = participa da colisão (chão/parede/plataforma); `oneWay` = plataforma
 * atravessável por baixo (só pousa vindo de cima). Usado pelo
 * {@link PlatformerPhysicsSystem}.
 *
 * O **offset** permite que o collider seja uma **sub-região** do objeto sem
 * desacoplar a entidade: o collider mora na MESMA entidade do mesh (Object3D +
 * Transform) e movem juntos, mas pode cobrir só o "deck" (não os pilares) ou
 * compensar um pivô descentralizado do GLB. Offset `0` = centrado no Transform.
 *
 * Distinto do `ColliderComponent` 3D (box/sphere/capsule) do physics de impulso
 * (`core/Physics`) — este é o collider simples 2D do plataformer.
 */
export class Collider2DComponent extends Component {
  constructor(
    /** Metade da largura (X). */
    public halfWidth = 0.5,
    /** Metade da altura (Y). */
    public halfHeight = 0.5,
    /** Participa da colisão como sólido (chão/parede/plataforma). */
    public solid = true,
    /** Plataforma de mão única: só colide vindo de cima (atravessa por baixo). */
    public oneWay = false,
    /** Offset do centro do AABB em X, relativo ao Transform. Default `0`. */
    public offsetX = 0,
    /** Offset do centro do AABB em Y, relativo ao Transform. Default `0`. */
    public offsetY = 0,
  ) {
    super();
  }
}
