import { Component } from '../ecs/Component.js';

/**
 * Caixa de colisão AABB no plano **XY** (plataforma 2.5D), centrada na posição
 * do {@link TransformComponent} da entidade. `solid` = participa da colisão
 * (chão/parede/plataforma); `oneWay` = plataforma atravessável por baixo (só
 * pousa vindo de cima). Usado pelo {@link PlatformerPhysicsSystem}.
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
  ) {
    super();
  }
}
