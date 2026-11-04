/** Folga do arredondamento: dt exatamente igual ao passo máximo não pode virar dois passos. */
const STEP_ROUNDING_EPSILON = 1e-6;

/** Passos de um quadro de física: `steps` passos iguais de `step` segundos. */
export interface PhysicsSubsteps {
  steps: number;
  step: number;
}

/**
 * Divide o quadro `dt` (s) em passos IGUAIS de no máximo `maxStep` s, com no
 * máximo `maxSteps` passos (SPEC-0671, ADR-0672). Acima de `maxSteps × maxStep`
 * o excedente é descartado: a simulação anda menos que o relógio naquele quadro,
 * em vez de gastar mais passos num quadro que já está lento.
 *
 * `dt` zero, negativo ou `NaN` dá `{ steps: 0, step: 0 }`.
 *
 * Escreve em `out` e o devolve: o `advance` roda todo quadro e passa um scratch
 * próprio, sem alocar um objeto por chamada.
 */
export function physicsSubsteps(
  dt: number,
  maxStep: number,
  maxSteps: number,
  out: PhysicsSubsteps = { steps: 0, step: 0 },
): PhysicsSubsteps {
  if (!(dt > 0) || !(maxSteps >= 1)) {
    out.steps = 0;
    out.step = 0;
    return out;
  }
  const wanted = Math.ceil(dt / maxStep - STEP_ROUNDING_EPSILON);
  const steps = Math.min(Math.max(wanted, 1), Math.floor(maxSteps));
  out.steps = steps;
  out.step = Math.min(dt, steps * maxStep) / steps;
  return out;
}
