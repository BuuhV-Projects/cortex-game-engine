/** O que a regra de repouso lê de um veículo (o {@link Vehicle} do Rapier, ou um dublê nos testes). */
export interface RestingVehicle {
  readonly engineForce: number;
  readonly wheelCount: number;
  linvelSquared(): number;
  angvelSquared(): number;
  wheelIsInContact(i: number): boolean;
}

/**
 * Abaixo disto (m/s) o chassi está parado. Folgado: o carro freado oscila na suspensão (~0,09 m/s medido no Port
 * Hollow), e um limite apertado zerava a contagem a cada oscilação — quase nenhum carro dormia.
 */
export const REST_SPEED = 0.2;
/** Abaixo disto (rad/s) o chassi não gira (folgado pelo mesmo motivo). */
export const REST_SPIN = 0.2;
/** Subpassos seguidos em repouso até dormir (0,5 s com o passo de 1/60 s). */
export const REST_STEPS = 30;

/** Em repouso neste subpasso: sem motor, parado, sem girar e com todas as rodas no chão (SPEC-0654). */
export function atRest(v: RestingVehicle): boolean {
  if (v.engineForce !== 0) return false;
  if (v.linvelSquared() >= REST_SPEED * REST_SPEED || v.angvelSquared() >= REST_SPIN * REST_SPIN) return false;
  for (let i = 0; i < v.wheelCount; i++) if (!v.wheelIsInContact(i)) return false;
  return true;
}

/** Contagem de subpassos em repouso depois deste subpasso: soma um, ou zera fora do repouso. */
export function nextRestSteps(steps: number, v: RestingVehicle): number {
  return atRest(v) ? steps + 1 : 0;
}
