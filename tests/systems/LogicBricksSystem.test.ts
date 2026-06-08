/**
 * Testes do runtime de Logic Bricks (src/systems/LogicBricksSystem.ts) +
 * parse (src/scene/LogicBricks.ts): avaliação de sensores (always/key/edge),
 * gate dos controllers (and/or) e validação.
 */
import { describe, it, expect } from 'vitest';
import { evalSensors, fireActuators } from '../../src/systems/LogicBricksSystem.js';
import { parseLogic, type LogicDefinition } from '../../src/scene/LogicBricks.js';

const def: LogicDefinition = {
  sensors: [
    { type: 'always', id: 'sa' },
    { type: 'key', id: 'sk', key: 'ArrowRight' },
    { type: 'key', id: 'se', key: 'Space', edge: true },
  ],
  controllers: [
    { id: 'c1', op: 'and', sensors: ['sa', 'sk'], actuators: ['a1'] },
    { id: 'c2', op: 'or', sensors: ['se'], actuators: ['a2'] },
  ],
  actuators: [
    { type: 'motion', id: 'a1', loc: [1, 0, 0] },
    { type: 'animation', id: 'a2', clip: 'Jump' },
  ],
};

describe('evalSensors', () => {
  it('always sempre ativo; key segue a tecla', () => {
    const a = evalSensors(def, (k) => k === 'ArrowRight', {});
    expect(a['sa']).toBe(true);
    expect(a['sk']).toBe(true);
  });

  it('sensor edge só dispara na transição (press)', () => {
    const prev: Record<string, boolean> = {};
    // frame 1: tecla pressionada → edge ativo
    expect(evalSensors(def, (k) => k === 'Space', prev)['se']).toBe(true);
    // frame 2: ainda pressionada → edge NÃO dispara
    expect(evalSensors(def, (k) => k === 'Space', prev)['se']).toBe(false);
    // frame 3: soltou → frame 4 reprime → dispara de novo
    evalSensors(def, () => false, prev);
    expect(evalSensors(def, (k) => k === 'Space', prev)['se']).toBe(true);
  });
});

describe('fireActuators', () => {
  it('and: todos os sensores ativos → dispara', () => {
    expect(fireActuators(def, { sa: true, sk: true, se: false }).has('a1')).toBe(true);
  });
  it('and: um sensor inativo → não dispara', () => {
    expect(fireActuators(def, { sa: true, sk: false }).has('a1')).toBe(false);
  });
  it('or: um sensor ativo → dispara', () => {
    expect(fireActuators(def, { se: true }).has('a2')).toBe(true);
  });
});

describe('parseLogic', () => {
  it('aceita bricks válidos', () => {
    expect(parseLogic(def)).not.toBeNull();
  });
  it('rejeita sensor de tipo inválido', () => {
    expect(parseLogic({ sensors: [{ type: 'mouse', id: 'x' }], controllers: [], actuators: [] })).toBeNull();
  });
});
