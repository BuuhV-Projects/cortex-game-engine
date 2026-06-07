import { Component } from '../ecs/Component.js';

/**
 * Forma do collider 2D do plataformer:
 * - `box` — retângulo AABB (`halfWidth`×`halfHeight`). Padrão.
 * - `circle` — círculo de raio `halfWidth` (bom pra pedras/bolas; `halfHeight`
 *   é ignorado).
 * - `capsule` — cápsula **vertical**: largura = `2·halfWidth` (raio = `halfWidth`),
 *   altura total = `2·halfHeight`, com tampas semicirculares de raio `halfWidth`
 *   (boa pro player escorregar em quinas). Se `halfHeight ≤ halfWidth`, vira um
 *   círculo.
 * - `heightfield` — **perfil de chão** por pontos (`points`): o player anda
 *   seguindo a curva (pontes arqueadas, morros, rampas). Floor one-way: pousa
 *   vindo de cima, atravessa por baixo. `halfWidth`/`halfHeight` viram só o bbox
 *   (broadphase), derivado dos pontos.
 */
export type ColliderShape2D = 'box' | 'circle' | 'capsule' | 'heightfield';

/**
 * Colisor 2D do plataformer (plano **XY**), centrado na posição do
 * {@link TransformComponent} **+ um offset** (`offsetX`/`offsetY`). `shape` define
 * a forma (box/circle/capsule). `solid` = participa da colisão (chão/parede);
 * `oneWay` = plataforma atravessável por baixo (só pousa de cima). Usado pelo
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
    /** Metade da largura (X) — também o **raio** quando `shape` é circle/capsule. */
    public halfWidth = 0.5,
    /** Metade da altura (Y). */
    public halfHeight = 0.5,
    /** Participa da colisão como sólido (chão/parede/plataforma). */
    public solid = true,
    /** Plataforma de mão única: só colide vindo de cima (atravessa por baixo). */
    public oneWay = false,
    /** Offset do centro em X, relativo ao Transform. Default `0`. */
    public offsetX = 0,
    /** Offset do centro em Y, relativo ao Transform. Default `0`. */
    public offsetY = 0,
    /** Forma do collider. Default `box`. Ver {@link ColliderShape2D}. */
    public shape: ColliderShape2D = 'box',
    /**
     * Pontos do perfil (LOCAL, relativos ao centro = Transform + offset),
     * **ordenados por X**. Só usado quando `shape` é `heightfield`. Ex.:
     * `[[-4, 0], [0, -0.8], [4, 0]]` = ponte que afunda 0.8 no meio.
     */
    public points?: readonly (readonly [number, number])[],
  ) {
    super();
  }
}
