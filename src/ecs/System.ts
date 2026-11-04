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
   * Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
   * nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
   * — ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
   * `false` (sistema da cena/jogo, é removido no clear).
   */
  keepOnClear: boolean = false;

  /**
   * Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
   * Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
   * `DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).
   */
  readonly profileLabel?: string;

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
   *                    **Só leitura**: o `World` reusa o mesmo array entre
   *                    quadros enquanto a estrutura do ECS não muda (SPEC-0673).
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
