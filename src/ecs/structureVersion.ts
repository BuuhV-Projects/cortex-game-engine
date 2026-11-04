/**
 * Versão da estrutura do ECS (ADR-0676): sobe a cada entidade criada/destruída e a cada componente
 * adicionado/removido, em qualquer `World`. A consulta do `World.tick` guarda o resultado com a versão em que foi
 * montado e só remonta quando ela muda. Interno: fora do `index-runtime`.
 */
let version = 0;

/** Versão atual da estrutura. */
export function structureVersion(): number {
  return version;
}

/** Marca que a estrutura mudou (entidade ou componente). */
export function bumpStructureVersion(): void {
  version++;
}
