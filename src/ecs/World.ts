import { Component } from './Component.js';
import { Entity } from './Entity.js';
import { System } from './System.js';
import { bumpStructureVersion, structureVersion } from './structureVersion.js';

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

/** Resultado de uma consulta do `tick` e a versão de estrutura em que foi montado (ADR-0676). */
interface CachedQuery {
  version: number;
  entities: Entity[];
}

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
   * As mesmas entities em ordem de inserção, percorridas por índice: o `for…of` de um `Set` cria um objeto de
   * resultado por passo no Hermes (ADR-0676). Remontada (array novo) quando a estrutura muda.
   */
  private _list: Entity[] = [];
  /** Versão de estrutura em que `_list` foi montada; diferente da atual = remontar. */
  private _listVersion = -1;
  /** Consulta do `tick` por array `requiredComponents` (identidade), com a versão em que foi montada. */
  private readonly _queries = new Map<readonly ComponentClass[], CachedQuery>();

  /**
   * Lista de systems registrados, mantida em ordem crescente de `priority`.
   * A ordenação é feita a cada `addSystem`, portanto `tick` itera diretamente.
   */
  private _systems: System[] = [];
  /** Perfil por sistema (SPEC-0236); null = desligado, que e o default. */
  private _systemProfile: Map<string, number> | null = null;

  // ─── Entity Management ─────────────────────────────────────────────────────

  /**
   * Cria uma nova entity, registra-a no world e a retorna.
   *
   * @returns A entity recém-criada com UUID único.
   */
  createEntity(): Entity {
    const entity = new Entity();
    this._entities.add(entity);
    bumpStructureVersion();
    return entity;
  }

  /**
   * Remove a entity do world.
   * Sem efeito se a entity não pertencer a este world.
   *
   * @param entity - A entity a ser destruída.
   */
  destroyEntity(entity: Entity): void {
    if (this._entities.delete(entity)) bumpStructureVersion();
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
      this._systems[index].dispose();
      this._systems.splice(index, 1);
    }
  }

  /**
   * Esvazia o world pra trocar de fase/cena: remove entities e systems, chamando
   * `dispose()` nos systems removidos (libera handles nativos, ex.: mundo do
   * Rapier). PRESERVA os marcados `keepOnClear` — overlays que sobrevivem à
   * troca (ex.: os sistemas + o alvo do editor F2). Depois re-registre os
   * systems da próxima cena.
   *
   * O objeto `World` continua o MESMO (só é esvaziado), então referências a
   * `game.world` seguem válidas.
   */
  clear(): void {
    const kept: System[] = [];
    for (const system of this._systems) {
      if (system.keepOnClear) kept.push(system);
      else system.dispose();
    }
    this._systems = kept;
    for (const entity of [...this._entities]) {
      if (!entity.keepOnClear) this._entities.delete(entity);
    }
    this._queries.clear();
    bumpStructureVersion();
  }

  /**
   * `true` se já existe um system registrado da classe `SystemClass`. Útil para
   * registrar um system **sob demanda só uma vez** (ex.: o `buildScene` liga o
   * `SpriteAnimationSystem` quando a cena tem sprites animados, sem duplicar).
   *
   * @param SystemClass - Construtor da classe do system a procurar.
   */
  hasSystem(SystemClass: SystemClass): boolean {
    return this._systems.some((s) => s instanceof SystemClass);
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
    return this._filter(componentClasses);
  }

  /**
   * Array novo com as entities que têm todos os `componentClasses`, na ordem de inserção. Laço por índice, sem
   * `every` + closure (SPEC-0334) nem iterador de `Set` (ADR-0676).
   */
  private _filter(componentClasses: readonly ComponentClass[]): Entity[] {
    const list = this._allEntities();
    const result: Entity[] = [];
    outer: for (let e = 0; e < list.length; e++) {
      const entity = list[e]!;
      for (let i = 0; i < componentClasses.length; i++) {
        if (!entity.hasComponent(componentClasses[i]!)) continue outer;
      }
      result.push(entity);
    }
    return result;
  }

  /** Todas as entities em ordem de inserção; array novo só quando a estrutura mudou. */
  private _allEntities(): Entity[] {
    const version = structureVersion();
    if (this._listVersion !== version) {
      this._list = Array.from(this._entities);
      this._listVersion = version;
    }
    return this._list;
  }

  /**
   * A consulta do `tick` (ADR-0676): o mesmo array enquanto a estrutura não muda, sem varrer nem alocar.
   * `requiredComponents = []` recebe a lista de todas as entities.
   */
  private _cachedQuery(required: readonly ComponentClass[]): Entity[] {
    if (required.length === 0) return this._allEntities();
    const version = structureVersion();
    let cached = this._queries.get(required);
    if (cached === undefined) {
      cached = { version: -1, entities: [] };
      this._queries.set(required, cached);
    }
    if (cached.version !== version) {
      cached.entities = this._filter(required);
      cached.version = version;
    }
    return cached.entities;
  }

  // ─── Tick ──────────────────────────────────────────────────────────────────

  /**
   * Executa um passo de simulação, iterando todos os systems em ordem de
   * prioridade crescente.
   *
   * Para cada system, o `World`:
   * 1. Obtém `requiredComponents` declarado estaticamente na classe do system.
   * 2. Filtra as entities elegíveis — em cache enquanto nenhuma entity nem componente muda (ADR-0676).
   * 3. Repassa as entities filtradas ao `system.update(entities, deltaTime)`. O array é compartilhado
   *    entre sistemas e quadros: o `update` não deve mutá-lo.
   *
   * Chamado pelo `GameLoop` a cada frame (passo variável) ou passo fixo de
   * física — vide ADR-0002.
   *
   * @param deltaTime - Tempo decorrido desde o último tick, em ms.
   */
  tick(deltaTime: number): void {
    // Com o perfil por sistema ligado (SPEC-0236), cada `update` é cronometrado
    // separadamente — é a única forma de saber QUAL sistema come o `world`, que
    // o trace só reportava como um bloco de 9,3 ms.
    const profile = this._systemProfile;
    for (const system of this._systems) {
      if (system.pauseWhen?.()) continue; // sistema pausado (ex.: gameplay no editor)
      const required = (system.constructor as typeof System).requiredComponents;
      const entities = this._cachedQuery(required);
      if (profile === null) {
        system.update(entities, deltaTime);
        continue;
      }
      const started = performance.now();
      system.update(entities, deltaTime);
      // `profileLabel` primeiro: no bundle minificado o nome da classe é ilegível (SPEC-0671).
      const name = system.profileLabel ?? system.constructor.name;
      profile.set(name, (profile.get(name) ?? 0) + (performance.now() - started));
    }
  }

  /**
   * Liga o perfil por sistema e devolve o mapa vivo (nome → ms acumulados). O nome
   * é o `profileLabel` do sistema, ou o nome da classe quando ele não declara um.
   * Desligado por default: cronometrar todo sistema todo frame é instrumento,
   * não comportamento de produção.
   */
  enableSystemProfile(): Map<string, number> {
    this._systemProfile ??= new Map<string, number>();
    return this._systemProfile;
  }

  /** Zera os acumuladores do perfil por sistema, mantendo-o ligado. */
  resetSystemProfile(): void {
    this._systemProfile?.clear();
  }
}
