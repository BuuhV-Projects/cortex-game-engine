import { Component } from './Component.js';

/**
 * Tipo utilitário que representa o construtor de uma subclasse de Component.
 * Usado nos métodos que recebem uma classe (e não uma instância) como parâmetro.
 */
type ComponentClass<T extends Component = Component> = new (...args: any[]) => T;

/**
 * Entidade do sistema ECS.
 *
 * Wrapper em torno de um UUID único que agrega componentes indexados pelo nome
 * da classe construtora. Vide ADR-0002.
 *
 * @example
 * const entity = new Entity();
 * entity.addComponent(new TransformComponent());
 * const t = entity.getComponent(TransformComponent);
 */
export class Entity {
  /** Identificador único gerado via `crypto.randomUUID()`. */
  readonly id: string;

  private readonly _components: Map<string, Component> = new Map();

  constructor() {
    this.id = crypto.randomUUID();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Adiciona um componente à entidade.
   * Se já existir um componente do mesmo tipo, ele é substituído.
   *
   * @returns `this` para permitir encadeamento (method chaining).
   */
  addComponent(component: Component): this {
    this._components.set(component.type, component);
    return this;
  }

  /**
   * Remove o componente do tipo especificado.
   * Sem efeito se o componente não estiver presente.
   */
  removeComponent<T extends Component>(ComponentClass: ComponentClass<T>): void {
    this._components.delete(ComponentClass.name);
  }

  /**
   * Retorna o componente do tipo especificado, ou `undefined` se ausente.
   *
   * @example
   * const t = entity.getComponent(TransformComponent);
   * if (t) { t.position.x = 10; }
   */
  getComponent<T extends Component>(ComponentClass: ComponentClass<T>): T | undefined {
    return this._components.get(ComponentClass.name) as T | undefined;
  }

  /**
   * Verifica se a entidade possui um componente do tipo especificado.
   */
  hasComponent<T extends Component>(ComponentClass: ComponentClass<T>): boolean {
    return this._components.has(ComponentClass.name);
  }

  /**
   * Retorna todos os componentes da entidade como array.
   * A ordem reflete a ordem de inserção no Map.
   */
  getAllComponents(): Component[] {
    return Array.from(this._components.values());
  }
}
