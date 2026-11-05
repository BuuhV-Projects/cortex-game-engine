/**
 * Testes do hot reload de script (SPEC-0697 §2): a instância viva troca de classe
 * preservando identidade e estado; script que some do módulo é derrubado; módulo com
 * export que não é ScriptBehavior devolve false sem efeito.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { ScriptComponent, type ScriptSlot } from '../../src/components/ScriptComponent.js';
import { ScriptHostSystem } from '../../src/systems/ScriptHostSystem.js';
import { ScriptBehavior } from '../../src/scripts/ScriptBehavior.js';
import { registerScripts, getScript, clearScripts } from '../../src/scripts/ScriptRegistry.js';
import { hotReplaceScripts } from '../../src/scripts/ScriptHotReload.js';

const FRAME_MS = 16;
const PATH = 'scripts/Girar.ts';
const GLOB_PATH = './scripts/Girar.ts';

class GirarV1 extends ScriptBehavior {
  static override scriptName = 'Girar';
  ticks = 0;
  starts = 0;
  destroyed = 0;
  override onStart(): void {
    this.starts++;
  }
  override onUpdate(): void {
    this.ticks++;
  }
  override onDestroy(): void {
    this.destroyed++;
  }
}

let world: World;

/** Sobe um mundo com um host e uma entidade com o script `type`, já no Play. */
function playWith(type: string, fields?: Record<string, unknown>): ScriptSlot {
  world = new World();
  world.addSystem(new ScriptHostSystem({ world }));
  const e = world.createEntity();
  e.addComponent(new ScriptComponent(null, [{ type, fields }]));
  world.tick(FRAME_MS);
  return e.getComponent(ScriptComponent)!.scripts[0]!;
}

describe('hotReplaceScripts', () => {
  beforeEach(() => {
    clearScripts();
    registerScripts({ [GLOB_PATH]: { GirarV1 } });
  });
  afterEach(() => world?.clear());

  it('preserva identidade e estado; método novo vale no próximo onUpdate', () => {
    const slot = playWith('Girar');
    const inst = slot.instance as GirarV1;
    class GirarV2 extends GirarV1 {
      override onUpdate(): void {
        this.ticks += 10;
      }
    }
    expect(hotReplaceScripts(PATH, { GirarV2 })).toBe(true);
    expect(slot.instance).toBe(inst);
    expect(inst).toBeInstanceOf(GirarV2);
    expect(inst.ticks).toBe(1);
    world.tick(FRAME_MS);
    expect(inst.ticks).toBe(11);
    expect(getScript('Girar')).toBe(GirarV2);
  });

  it('started preservado: onStart não roda de novo', () => {
    const slot = playWith('Girar');
    class GirarV2 extends GirarV1 {}
    hotReplaceScripts(PATH, { GirarV2 });
    world.tick(FRAME_MS);
    expect(slot.started).toBe(true);
    expect((slot.instance as GirarV1).starts).toBe(1);
  });

  it('campo novo recebe o inicializador da classe nova', () => {
    const slot = playWith('Girar');
    class GirarV2 extends GirarV1 {
      speed = 7;
    }
    hotReplaceScripts(PATH, { GirarV2 });
    expect((slot.instance as GirarV2).speed).toBe(7);
  });

  it('campo novo do schema usa o override do slot (ou o default)', () => {
    const slot = playWith('Girar', { rpm: 99 });
    class GirarV2 extends GirarV1 {
      static override fields = {
        rpm: { type: 'number', default: 30 },
        tilt: { type: 'number', default: 5 },
      } as const;
      rpm = 1;
      tilt = 1;
    }
    hotReplaceScripts(PATH, { GirarV2 });
    const inst = slot.instance as GirarV2;
    expect(inst.rpm).toBe(99);
    expect(inst.tilt).toBe(5);
  });

  it('chama onHotReload, e a exceção dele não derruba a troca', () => {
    const slot = playWith('Girar');
    let calls = 0;
    class GirarV2 extends GirarV1 {
      override onHotReload(): void {
        calls++;
        throw new Error('bugado');
      }
    }
    expect(hotReplaceScripts(PATH, { GirarV2 })).toBe(true);
    expect(calls).toBe(1);
    expect(slot.instance).toBeInstanceOf(GirarV2);
  });

  it('script que sumiu do módulo: onDestroy, slot zerado e fora do registro', () => {
    const slot = playWith('Girar');
    const inst = slot.instance as GirarV1;
    expect(hotReplaceScripts(PATH, {})).toBe(true);
    expect(inst.destroyed).toBe(1);
    expect(slot.instance).toBeNull();
    expect(slot.started).toBe(false);
    expect(getScript('Girar')).toBeUndefined();
  });

  it('export estrangeiro → false e nada muda', () => {
    const slot = playWith('Girar');
    const inst = slot.instance;
    class GirarV2 extends GirarV1 {}
    expect(hotReplaceScripts(PATH, { GirarV2, SPEED: 3 })).toBe(false);
    expect(hotReplaceScripts(PATH, { GirarV2, helper: () => 1 })).toBe(false);
    expect(slot.instance).toBe(inst);
    expect(inst).not.toBeInstanceOf(GirarV2);
    expect(getScript('Girar')).toBe(GirarV1);
  });

  it('export default de classe ScriptBehavior conta como script', () => {
    const slot = playWith('Girar');
    class GirarV2 extends GirarV1 {}
    expect(hotReplaceScripts(PATH, { default: GirarV2 })).toBe(true);
    expect(slot.instance).toBeInstanceOf(GirarV2);
  });

  it('fora do Play só troca o registro; o próximo Play instancia a nova', () => {
    world = new World();
    let editing = true;
    world.addSystem(new ScriptHostSystem({ world }, { isEditing: () => editing }));
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'Girar' }]));
    world.tick(FRAME_MS);
    const slot = e.getComponent(ScriptComponent)!.scripts[0]!;
    class GirarV2 extends GirarV1 {}
    hotReplaceScripts(PATH, { GirarV2 });
    expect(slot.instance).toBeNull();
    editing = false;
    world.tick(FRAME_MS);
    expect(slot.instance).toBeInstanceOf(GirarV2);
  });

  it('base de um script de outro arquivo → false (reload completo), derivada intacta', () => {
    class Base extends ScriptBehavior {
      v(): number {
        return 1;
      }
    }
    class Enemy extends Base {}
    registerScripts({ './scripts/Base.ts': { Base }, './scripts/Enemy.ts': { Enemy } });
    const slot = playWith('Enemy');
    class Base2 extends ScriptBehavior {
      v(): number {
        return 2;
      }
    }
    expect(hotReplaceScripts('scripts/Base.ts', { Base: Base2 })).toBe(false);
    expect(getScript('Base')).toBe(Base);
    expect(slot.instance).toBeInstanceOf(Enemy);
    // Derivada no MESMO arquivo da base troca a quente normalmente.
    class Enemy2 extends Base {}
    expect(hotReplaceScripts('scripts/Enemy.ts', { Enemy: Enemy2 })).toBe(true);
  });
});
