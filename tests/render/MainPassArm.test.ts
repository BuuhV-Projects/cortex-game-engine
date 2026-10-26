import { describe, it, expect } from 'vitest';
import { ParityFreeze, mainPassArm, parityTarget } from '../../src/render/MainPassArm.js';

describe('ParityFreeze (SPEC-0362)', () => {
  it('conta só tempo de jogo, congela depois e alterna o braço a cada quadro', () => {
    mainPassArm.three = false;
    const f = new ParityFreeze(2);
    expect(f.shouldUpdate(0, false)).toBe(true); // carregando: não conta
    expect(f.shouldUpdate(5000, true)).toBe(true); // 1º quadro de jogo
    expect(f.shouldUpdate(6999, true)).toBe(true);
    expect(f.shouldUpdate(7000, true)).toBe(false); // congelou: quadro nativo
    expect(mainPassArm.three).toBe(false);
    expect(f.shouldUpdate(7016, true)).toBe(false);
    expect(mainPassArm.three).toBe(true);
    expect(f.shouldUpdate(7032, true)).toBe(false);
    expect(mainPassArm.three).toBe(false);
    mainPassArm.three = false;
  });

  it("?parityTarget=ui alternates only the UI arm (SPEC-0616)", () => {
    mainPassArm.three = false;
    mainPassArm.uiThree = false;
    const f = new ParityFreeze(1, 'ui');
    f.shouldUpdate(0, true);
    expect(f.shouldUpdate(1000, true)).toBe(false); // freezes
    f.shouldUpdate(1016, true);
    expect(mainPassArm.uiThree).toBe(true);
    expect(mainPassArm.three).toBe(false);
    f.shouldUpdate(1032, true);
    expect(mainPassArm.uiThree).toBe(false);
  });

  it('parityTarget reads the query value', () => {
    expect(parityTarget('?a=1&parityTarget=ui&b=2')).toBe('ui');
    expect(parityTarget('?parityTarget=lighting')).toBe('lighting');
    expect(parityTarget('?parityTarget=renderer')).toBe('draw');
    expect(parityTarget('')).toBe('draw');
  });
});
