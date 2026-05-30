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
export declare class Entity {
    /** Identificador único gerado via `crypto.randomUUID()`. */
    readonly id: string;
    private readonly _components;
    constructor();
    /**
     * Adiciona um componente à entidade.
     * Se já existir um componente do mesmo tipo, ele é substituído.
     *
     * @returns `this` para permitir encadeamento (method chaining).
     */
    addComponent(component: Component): this;
    /**
     * Remove o componente do tipo especificado.
     * Sem efeito se o componente não estiver presente.
     */
    removeComponent<T extends Component>(ComponentClass: ComponentClass<T>): void;
    /**
     * Retorna o componente do tipo especificado, ou `undefined` se ausente.
     *
     * @example
     * const t = entity.getComponent(TransformComponent);
     * if (t) { t.position.x = 10; }
     */
    getComponent<T extends Component>(ComponentClass: ComponentClass<T>): T | undefined;
    /**
     * Verifica se a entidade possui um componente do tipo especificado.
     */
    hasComponent<T extends Component>(ComponentClass: ComponentClass<T>): boolean;
    /**
     * Retorna todos os componentes da entidade como array.
     * A ordem reflete a ordem de inserção no Map.
     */
    getAllComponents(): Component[];
}
export {};
//# sourceMappingURL=Entity.d.ts.map