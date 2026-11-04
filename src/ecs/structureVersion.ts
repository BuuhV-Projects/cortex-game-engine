/**
 * Versão estrutural do ECS (SPEC-0673): sobe quando uma entidade ganha/perde
 * componente ou entra/sai de um `World`. O `World.tick` reusa a query de cada
 * sistema enquanto ela não muda. Global (e não por `World`) porque a `Entity`
 * não conhece o seu mundo; invalidar o cache de outro mundo é só conservador.
 *
 * Interno: não exportado pelo `index-runtime.ts`.
 */
let version = 0;

/** Versão atual. */
export function ecsStructureVersion(): number {
  return version;
}

/** Marca uma mudança estrutural (invalida as queries cacheadas). */
export function bumpEcsStructure(): void {
  version++;
}
