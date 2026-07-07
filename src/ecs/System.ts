import { Component } from './Component.js';
import { Entity } from './Entity.js';

/**
 * Tipo utilitário que representa o construtor de uma subclasse de Component.
 * Usado em `requiredComponents` para declarar quais tipos o sistema consulta.
 */
type ComponentClass = new (...args: any[]) => Component;

/**
 * Classe base para todos os sistemas do ECS.
 *
 * Cada sistema encapsula **lógica** que opera sobre entidades que possuem
 * um conjunto específico de componentes. O `World` filtra as entidades via
 * `World.query(requiredComponents)` e as repassa ao `update` de cada sistema
 * em ordem crescente de `priority` a cada tick — vide ADR-0002.
 *
 * Subclasses devem:
 * 1. Declarar `static requiredComponents` com os construtores dos componentes
 *    que serão acessados dentro de `update`.
 * 2. Implementar `update(entities, deltaTime)` com a lógica do sistema.
 *
 * @example
 * class MovementSystem extends System {
 *   static requiredComponents = [TransformComponent, VelocityComponent];
 *
 *   update(entities: Entity[], deltaTime: number): void {
 *     for (const entity of entities) {
 *       const transform = entity.getComponent(TransformComponent)!;
 *       const velocity = entity.getComponent(VelocityComponent)!;
 *       transform.position.x += velocity.x * deltaTime;
 *     }
 *   }
 * }
 */
export abstract class System {
  /**
   * Prioridade de execução deste sistema.
   *
   * O `World` ordena os sistemas por valor crescente antes de iterar no tick.
   * Sistemas com valores menores executam antes. Padrão: `0`.
   */
  priority: number = 0;

  /**
   * Construtores dos componentes que este sistema requer.
   *
   * O `World` usa essa lista para filtrar as entidades antes de chamar `update`,
   * garantindo que apenas entidades com todos os componentes declarados sejam
   * repassadas ao sistema.
   *
   * Subclasses devem sobrescrever este campo estático.
   *
   * @example
   * static requiredComponents = [TransformComponent, VelocityComponent];
   */
  static requiredComponents: ComponentClass[] = [];

  /**
   * Predicado opcional de PAUSA: se definido e retornar `true` num tick, o
   * `World` pula o `update` deste sistema nesse frame. Usado, por ex., pra pausar
   * a gameplay (física/input) enquanto o editor está ativo
   * (`pauseWhen = () => game.editorActive`).
   */
  pauseWhen?: () => boolean;

  /**
   * Executa a lógica do sistema para o frame/passo atual.
   *
   * @param entities  - Entidades filtradas pelo `World` que possuem todos os
   *                    componentes declarados em `requiredComponents`.
   * @param deltaTime - Tempo decorrido desde o último tick, em segundos.
   */
  abstract update(entities: Entity[], deltaTime: number): void;

  /**
   * Libera recursos ao remover o sistema — chamado por {@link World.clear} (e
   * pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
   * handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
   * {@link RapierPhysicsSystem}). Essencial pra trocar de cena/fase sem vazar.
   */
  dispose(): void {}
}
