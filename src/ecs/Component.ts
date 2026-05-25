/**
 * Classe base para todos os componentes do sistema ECS.
 *
 * Subclasses devem carregar apenas dados (ex: TransformComponent, MeshComponent).
 * A lógica pertence aos Systems — vide ADR-0002.
 */
export class Component {
  /** Indica se o componente está ativo. Systems podem ignorar componentes desativados. */
  enabled: boolean = true;

  /**
   * Identificador do tipo do componente.
   * Retorna o nome da classe construtora (ex: "TransformComponent").
   * Usado por Entity para indexar componentes no Map<string, Component>.
   */
  get type(): string {
    return this.constructor.name;
  }
}
