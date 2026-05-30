/**
 * Physics — sistema de física com colisão AABB sem dependências externas.
 *
 * Exporta:
 * - `RigidBodyComponent`: velocidade, massa e flag estático
 * - `ColliderComponent`:  tamanho e offset do AABB
 * - `PhysicsSystem`:      gravidade, integração e resolução de colisões
 *
 * Referência: ADR-0002 (ECS)
 */
import { Component } from '../ecs/Component.js';
import { Entity } from '../ecs/Entity.js';
import { System } from '../ecs/System.js';
/** Vetor de três componentes usado internamente pelos componentes de física. */
interface Vec3 {
    x: number;
    y: number;
    z: number;
}
/**
 * Componente que armazena o estado físico de uma entidade.
 *
 * `position` representa o centro de massa do corpo no espaço mundial.
 * `velocity` é expresso em unidades/s — o `PhysicsSystem` converte `deltaTime`
 * de ms para segundos antes de integrar.
 *
 * Quando a entidade também possui um componente de transform de renderização,
 * cabe ao usuário sincronizar `position` com ele após cada tick de física.
 */
export declare class RigidBodyComponent extends Component {
    /** Centro de massa do corpo no espaço mundial. */
    position: Vec3;
    /** Velocidade linear em unidades/s. */
    velocity: Vec3;
    /** Massa do corpo em kg. Ignorada se `isStatic` for `true`. */
    mass: number;
    /**
     * Quando `true`, o corpo não é movido nem recebe gravidade.
     * Ainda participa da detecção de colisão (comporta-se como superfície sólida).
     */
    isStatic: boolean;
}
/**
 * Componente que define o volume de colisão AABB da entidade.
 *
 * O AABB é centrado em `RigidBodyComponent.position + offset`, com dimensões
 * totais iguais a `size` (não half-extents). Padrão: cubo 1×1×1 sem offset.
 */
export declare class ColliderComponent extends Component {
    /** Dimensões totais do AABB (largura × altura × profundidade). */
    size: Vec3;
    /**
     * Deslocamento do centro do collider em relação à posição do RigidBody.
     * Útil quando a geometria visual não está centrada na origem do corpo.
     */
    offset: Vec3;
}
/**
 * Sistema de física AABB sem dependências externas.
 *
 * Por tick (deltaTime em ms, convertido internamente para segundos):
 * 1. **Gravidade**: aplica `gravity` (unidades/s²) no eixo -Y de todos os
 *    corpos dinâmicos (`isStatic === false`).
 * 2. **Integração**: Euler explícito — `position += velocity × dt`.
 * 3. **Colisão**: detecta e resolve colisões AABB entre todos os pares de
 *    entidades elegíveis (O(n²)).
 *
 * Para cada colisão detectada:
 * - Calcula o eixo de mínima penetração (MTV — Minimum Translation Vector).
 * - Separa os corpos ao longo desse eixo.
 * - Cancela a componente de velocidade na direção da colisão.
 *
 * Requer que cada entidade possua **ambos** `RigidBodyComponent` e
 * `ColliderComponent`.
 *
 * @example
 * const world = new World();
 * world.addSystem(new PhysicsSystem());
 *
 * const ball = world.createEntity();
 * ball.addComponent(Object.assign(new RigidBodyComponent(), {
 *   position: { x: 0, y: 5, z: 0 },
 *   velocity: { x: 0, y: 0, z: 0 },
 * }));
 * ball.addComponent(new ColliderComponent()); // cubo 1×1×1
 *
 * const floor = world.createEntity();
 * floor.addComponent(Object.assign(new RigidBodyComponent(), {
 *   position: { x: 0, y: 0, z: 0 },
 *   isStatic: true,
 * }));
 * floor.addComponent(Object.assign(new ColliderComponent(), {
 *   size: { x: 10, y: 0.5, z: 10 },
 * }));
 *
 * world.tick(16.67); // ~60 FPS
 */
export declare class PhysicsSystem extends System {
    /**
     * Aceleração gravitacional em unidades/s² aplicada no eixo -Y.
     * Padrão: 9.8 (gravidade terrestre). Ajuste conforme as necessidades do jogo.
     */
    gravity: number;
    /** @inheritdoc */
    static requiredComponents: (typeof RigidBodyComponent | typeof ColliderComponent)[];
    /**
     * Executa gravidade, integração e resolução de colisões para o passo atual.
     *
     * @param entities   - Entidades com `RigidBodyComponent` + `ColliderComponent`.
     * @param deltaTime  - Tempo do passo em **ms** (convertido para s internamente).
     */
    update(entities: Entity[], deltaTime: number): void;
    /**
     * Detecta e resolve a colisão AABB entre duas entidades usando o MTV.
     *
     * Se ambos forem dinâmicos: a separação é dividida igualmente.
     * Se um for estático: apenas o dinâmico é movido.
     * Se ambos forem estáticos: nenhuma ação é tomada.
     */
    private _resolveCollision;
}
export {};
//# sourceMappingURL=Physics.d.ts.map