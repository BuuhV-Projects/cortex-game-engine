/**
 * SPEC-0152 — `ScriptHostSystem.dispose()`: na TROCA DE FASE (`World.clear`),
 * as instâncias de script têm que ser derrubadas (`onDestroy`) como na borda
 * Play→Stop do editor (ADR-0143). Sem isso, listeners de `document` registrados
 * por scripts (moeda/checkpoint/chegada) sobreviviam à troca retendo a cena
 * INTEIRA da fase anterior — o vazamento de memória/GPU por fase do teste4.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { ScriptComponent } from '../../src/components/ScriptComponent.js';
import { ScriptHostSystem } from '../../src/systems/ScriptHostSystem.js';
import { ScriptBehavior } from '../../src/scripts/ScriptBehavior.js';
import { registerScript, clearScripts } from '../../src/scripts/ScriptRegistry.js';

const destroyed: string[] = [];

class FakeCoin extends ScriptBehavior {
  override onStart(): void {}
  override onUpdate(): void {}
  override onDestroy(): void {
    destroyed.push('coin');
  }
}

afterEach(() => {
  clearScripts();
  destroyed.length = 0;
});

describe('ScriptHostSystem.dispose (SPEC-0152)', () => {
  function setup() {
    registerScript('FakeCoin', FakeCoin);
    const world = new World();
    const host = new ScriptHostSystem({} as never);
    world.addSystem(host);
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'FakeCoin', fields: {} }]));
    return { world, e };
  }

  it('World.clear() (troca de fase) roda o onDestroy dos scripts', () => {
    const { world, e } = setup();
    world.tick(16); // instancia + onStart
    const comp = e.getComponent(ScriptComponent)!;
    expect(comp.scripts[0]!.instance).not.toBeNull();

    world.clear(); // troca de fase → dispose() do host → teardown

    expect(destroyed).toEqual(['coin']);
    expect(comp.scripts[0]!.instance).toBeNull(); // slot zerado (estado limpo)
  });

  it('dispose antes de qualquer tick não quebra (nada hospedado)', () => {
    registerScript('FakeCoin', FakeCoin);
    const host = new ScriptHostSystem({} as never);
    expect(() => host.dispose()).not.toThrow();
    expect(destroyed).toEqual([]);
  });

  it('onDestroy que lança não derruba o teardown dos demais', () => {
    registerScript('FakeCoin', FakeCoin);
    class Bomb extends ScriptBehavior {
      override onUpdate(): void {}
      override onDestroy(): void {
        throw new Error('boom');
      }
    }
    registerScript('Bomb', Bomb);
    const world = new World();
    world.addSystem(new ScriptHostSystem({} as never));
    const e = world.createEntity();
    e.addComponent(
      new ScriptComponent(null, [
        { type: 'Bomb', fields: {} },
        { type: 'FakeCoin', fields: {} },
      ]),
    );
    world.tick(16);
    expect(() => world.clear()).not.toThrow();
    expect(destroyed).toEqual(['coin']); // o segundo ainda foi destruído
  });
});
