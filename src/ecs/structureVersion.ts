/**
 * Contador de estrutura do ECS (SPEC-0674): sobe sempre que uma entidade entra/sai do `World` ou ganha/perde um
 * componente. Quem classifica entidades por componente (ex.: o {@link TerrainCollisionSystem}) guarda o valor e só
 * reclassifica quando ele muda — em vez de buscar componentes em todas as entidades a cada passo.
 */
let version = 0;

/** Marca uma mudança de estrutura (chamado por `Entity` e `World`). */
export function bumpEcsStructure(): void {
  version++;
}

/** Valor atual do contador. */
export function ecsStructureVersion(): number {
  return version;
}
