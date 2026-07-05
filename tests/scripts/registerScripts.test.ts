/**
 * Testes do auto-registro de scripts (`registerScripts` + glob):
 * nome por arquivo (estilo Unity), override por `static scriptName`,
 * arquivo com múltiplos scripts cai pro nome da classe, exports que não são
 * ScriptBehavior são ignorados.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptBehavior } from '../../src/scripts/ScriptBehavior.js';
import { registerScripts, getScript, listScripts, clearScripts } from '../../src/scripts/ScriptRegistry.js';

class CoinScript extends ScriptBehavior {}
class NomeBonito extends ScriptBehavior {
  static override scriptName = 'Moeda';
}
class DoisA extends ScriptBehavior {}
class DoisB extends ScriptBehavior {}

describe('registerScripts', () => {
  beforeEach(() => clearScripts());

  it('um script por arquivo → nome do arquivo (estilo Unity)', () => {
    const names = registerScripts({ './scripts/CoinScript.ts': { CoinScript } });
    expect(names).toEqual(['CoinScript']);
    expect(getScript('CoinScript')).toBe(CoinScript);
  });

  it('static scriptName tem precedência sobre o nome do arquivo', () => {
    registerScripts({ './scripts/NomeBonito.ts': { NomeBonito } });
    expect(getScript('Moeda')).toBe(NomeBonito);
    expect(getScript('NomeBonito')).toBeUndefined();
  });

  it('arquivo com VÁRIOS scripts → nome da classe (cada um)', () => {
    registerScripts({ './scripts/Dois.ts': { DoisA, DoisB } });
    expect(getScript('DoisA')).toBe(DoisA);
    expect(getScript('DoisB')).toBe(DoisB);
    expect(getScript('Dois')).toBeUndefined();
  });

  it('ignora exports que não são ScriptBehavior (consts, fns, tipos)', () => {
    const names = registerScripts({
      './scripts/CoinScript.ts': { CoinScript, DEFAULT_VALUE: 3, helper: () => 1 },
      './scripts/util.ts': { soma: (a: number, b: number) => a + b },
    });
    expect(names).toEqual(['CoinScript']);
    expect(listScripts()).toEqual(['CoinScript']);
  });
});
