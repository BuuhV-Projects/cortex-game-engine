import type { Entity } from '../ecs/Entity.js';
import { Collider2DComponent } from './Collider2DComponent.js';

/**
 * Componentes que NÃO tornam uma entidade dinâmica (por nome de classe). Regra de
 * allowlist do merge estático (SPEC-0120): componente desconhecido ⇒ dinâmico.
 */
export const STATIC_COMPONENTS: ReadonlySet<string> = new Set([
  'TransformComponent',
  'Object3DComponent',
  'Collider2DComponent',
]);

/**
 * A entidade é cenário parado? Todos os componentes no {@link STATIC_COMPONENTS} e
 * collider que não é GATILHO (`solid: false`, ADR-0220: objeto de jogo, medido e
 * escondido pelo jogo). É a classificação do merge estático (SPEC-0120) e do
 * congelamento do `Object3DSyncSystem` (SPEC-0684).
 */
export function isStaticEntity(entity: Entity): boolean {
  if (entity.getComponent(Collider2DComponent)?.solid === false) return false;
  const components = entity.getAllComponents();
  for (let i = 0; i < components.length; i++) {
    if (!STATIC_COMPONENTS.has(components[i]!.type)) return false;
  }
  return true;
}
