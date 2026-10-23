import { describe, it, expect } from 'vitest';
import { ParityFreeze, mainPassArm } from '../../src/render/MainPassArm.js';

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
});
