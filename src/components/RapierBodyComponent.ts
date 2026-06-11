import { Component } from '../ecs/Component.js';
import type { PhysicsBody, Vec3Like } from '../physics/RapierPhysics.js';

/** Tipo do corpo (estilo Unity/Rapier). */
export type RapierBodyType = 'dynamic' | 'fixed' | 'kinematic';

/** Forma do collider. `auto` deriva uma caixa do bounds do mesh (respeita escala). */
export type RapierBodyShape =
  | { kind: 'auto' }
  | { kind: 'box'; halfExtents: Vec3Like }
  | { kind: 'ball'; radius: number }
  | { kind: 'capsule'; halfHeight: number; radius: number };

/** Opções do {@link RapierBodyComponent}. */
export interface RapierBodyOptions {
  /**
   * `dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move.
   * Default `dynamic`. (Não se chama `type` porque a base {@link Component} usa `type`
   * como chave do ECS — campo `type` sombrearia o getter.)
   */
  bodyType?: RapierBodyType;
  /** Forma do collider. Default `{ kind: 'auto' }` (caixa do bounds). */
  shape?: RapierBodyShape;
  /** Quão "quicante" (0 = não quica). */
  restitution?: number;
  /** Atrito. */
  friction?: number;
  /** `true` = trigger (detecta sobreposição mas NÃO bloqueia). */
  isSensor?: boolean;
}

/**
 * **Corpo físico do Rapier** como componente (ADR-0061): declara que o objeto é um
 * corpo (rígido) — tipo + forma + material. O {@link RapierPhysicsSystem} cria o
 * corpo no Rapier preguiçosamente (a partir da pose atual do `Object3D`) e passa a
 * **escrever o transform do `Object3D`** a partir da simulação (o Rapier é o dono).
 *
 * @example
 * const e = world.createEntity()
 * e.addComponent(new Object3DComponent(mesh))
 * e.addComponent(new RapierBodyComponent({ bodyType: 'dynamic', shape: { kind: 'auto' } }))
 */
export class RapierBodyComponent extends Component {
  /** Tipo do corpo (dynamic/fixed/kinematic). NÃO usar `type` (colide com a base ECS). */
  bodyType: RapierBodyType;
  shape: RapierBodyShape;
  restitution?: number;
  friction?: number;
  isSensor: boolean;
  /** Handle do corpo no Rapier — criado pelo {@link RapierPhysicsSystem}. `null` até criar. */
  body: PhysicsBody | null = null;

  constructor(options: RapierBodyOptions = {}) {
    super();
    this.bodyType = options.bodyType ?? 'dynamic';
    this.shape = options.shape ?? { kind: 'auto' };
    this.restitution = options.restitution;
    this.friction = options.friction;
    this.isSensor = options.isSensor ?? false;
  }
}
