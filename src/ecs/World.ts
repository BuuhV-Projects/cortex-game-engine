import { Component } from './Component.js';
import { Entity } from './Entity.js';
import { System } from './System.js';

/**
 * Tipo utilitário para o construtor de uma subclasse de Component.
 * Usado em `query` para receber classes (não instâncias) como parâmetros.
 */
type ComponentClass<T extends Component = Component> = new (...args: any[]) => T;

/**
 * Tipo utilitário para o construtor de uma subclasse de System.
 * Usado em `removeSystem` para identificar o sistema a remover.
 */
type SystemClass = abstract new (...args: any[]) => System;

/**
 * Registro central do sistema ECS — vide ADR-0002.
 *
 * O `World` gerencia o ciclo de vida de entities e systems:
 * - **Entities**: criadas e destruídas via `createEntity` / `destroyEntity`.
 * - **Systems**: registrados via `addSystem` e removidos via `removeSystem`.
 *   São armazenados em ordem crescente de `priority`.
 * - **Query**: `query(...ComponentClasses)` retorna as entities que possuem
 *   *todos* os componentes especificados.
 * - **Tick**: `tick(deltaTime)` itera os systems em ordem de prioridade;
 *   cada system recebe apenas as entities que satisfazem seus
 *   `requiredComponents`.
 *
 * @example
 * const world = new World();
 * const player = world.createEntity();
 * player.addComponent(new TransformComponent());
 * player.addComponent(new VelocityComponent());
 *
 * world.addSystem(new MovementSystem());
 * world.tick(16); // executa um frame de 16 ms
 */
export class World {
  /** Conjunto de todas as entities ativas (Set garante O(1) para delete/has). */
  private readonly _entities: Set<Entity> = new Set();

  /**
   * Lista de systems registrados, mantida em ordem crescente de `priority`.
   * A ordenação é feita a cada `addSystem`, portanto `tick` itera diretamente.
   */
  private _systems: System[] = [];

  // ─── Entity Management ─────────────────────────────────────────────────────

  /**
   * Cria uma nova entity, registra-a no world e a retorna.
   *
   * @returns A entity recém-criada com UUID único.
   */
  createEntity(): Entity {
    const entity = new Entity();
    this._entities.add(entity);
    return entity;
  }

  /**
   * Remove a entity do world.
   * Sem efeito se a entity não pertencer a este world.
   *
   * @param entity - A entity a ser destruída.
   */
  destroyEntity(entity: Entity): void {
    this._entities.delete(entity);
  }

  // ─── System Management ─────────────────────────────────────────────────────

  /**
   * Adiciona um system ao world.
   *
   * A lista interna é reordenada por `priority` crescente após cada inserção,
   * garantindo que `tick` execute os systems na ordem correta sem custo extra
   * por frame.
   *
   * @param system - Instância do system a registrar.
   */
  addSystem(system: System): void {
    this._systems.push(system);
    this._systems.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove o primeiro system cuja classe corresponda a `SystemClass`.
   * Sem efeito se nenhum system do tipo especificado estiver registrado.
   *
   * @param SystemClass - Construtor da classe do system a remover.
   */
  removeSystem(SystemClass: SystemClass): void {
    const index = this._systems.findIndex((s) => s instanceof SystemClass);
    if (index !== -1) {
      this._systems.splice(index, 1);
    }
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  /**
   * Retorna todas as entities que possuem **todos** os componentes especificados.
   *
   * Sem argumentos, retorna todas as entities ativas no world.
   *
   * @param componentClasses - Classes de componentes que a entity deve possuir.
   * @returns Array de entities que satisfazem todos os critérios.
   *
   * @example
   * const moving = world.query(TransformComponent, VelocityComponent);
   */
  query<T extends Component>(...componentClasses: ComponentClass<T>[]): Entity[] {
    const result: Entity[] = [];
    for (const entity of this._entities) {
      if (componentClasses.every((cls) => entity.hasComponent(cls))) {
        result.push(entity);
      }
    }
    return result;
  }

  // ─── Tick ──────────────────────────────────────────────────────────────────

  /**
   * Executa um passo de simulação, iterando todos os systems em ordem de
   * prioridade crescente.
   *
   * Para cada system, o `World`:
   * 1. Obtém `requiredComponents` declarado estaticamente na classe do system.
   * 2. Chama `query(...requiredComponents)` para filtrar as entities elegíveis.
   * 3. Repassa as entities filtradas ao `system.update(entities, deltaTime)`.
   *
   * Chamado pelo `GameLoop` a cada frame (passo variável) ou passo fixo de
   * física — vide ADR-0002.
   *
   * @param deltaTime - Tempo decorrido desde o último tick, em ms.
   */
  tick(deltaTime: number): void {
    for (const system of this._systems) {
      if (system.pauseWhen?.()) continue; // sistema pausado (ex.: gameplay no editor)
      const required = (system.constructor as typeof System).requiredComponents;
      const entities = this.query(...required);
      system.update(entities, deltaTime);
    }
  }
}
