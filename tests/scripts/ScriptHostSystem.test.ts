import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { ScriptComponent } from '../../src/components/ScriptComponent.js';
import { ScriptHostSystem } from '../../src/systems/ScriptHostSystem.js';
import { ScriptBehavior } from '../../src/scripts/ScriptBehavior.js';
import { registerScript, clearScripts, listScripts, getScriptFields } from '../../src/scripts/ScriptRegistry.js';

class Spinner extends ScriptBehavior {
  static fields = { rpm: { type: 'number', default: 30 } } as const;
  rpm = 0;
  starts = 0;
  updates = 0;
  lastDt = 0;
  destroyed = 0;
  override onStart(): void {
    this.starts++;
  }
  override onUpdate(dt: number): void {
    this.updates++;
    this.lastDt = dt;
  }
  override onDestroy(): void {
    this.destroyed++;
  }
}

class Boom extends ScriptBehavior {
  override onUpdate(): void {
    throw new Error('script bugado');
  }
}

const slot0 = (e: ReturnType<World['createEntity']>): { instance: Spinner | null } =>
  e.getComponent(ScriptComponent)!.scripts[0]! as unknown as { instance: Spinner | null };

describe('ScriptRegistry + ScriptHostSystem', () => {
  beforeEach(() => clearScripts());

  it('registra/lista scripts e expõe o schema de campos', () => {
    registerScript('Spinner', Spinner);
    expect(listScripts()).toEqual(['Spinner']);
    expect(getScriptFields('Spinner').rpm.default).toBe(30);
    expect(getScriptFields('Inexistente')).toEqual({});
  });

  it('instancia, chama onStart UMA vez e onUpdate todo frame (dt em segundos)', () => {
    registerScript('Spinner', Spinner);
    const world = new World();
    world.addSystem(new ScriptHostSystem({ world }));
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'Spinner' }]));

    world.tick(16); // 16ms → 0.016s
    world.tick(16);
    const inst = slot0(e).instance!;
    expect(inst.starts).toBe(1); // onStart só no 1º frame
    expect(inst.updates).toBe(2);
    expect(inst.lastDt).toBeCloseTo(0.016, 3); // ms convertido p/ segundos
  });

  it('aplica os campos: default do schema, ou override da cena', () => {
    registerScript('Spinner', Spinner);
    const world = new World();
    world.addSystem(new ScriptHostSystem({ world }));
    const eDefault = world.createEntity();
    eDefault.addComponent(new ScriptComponent(null, [{ type: 'Spinner' }]));
    const eOverride = world.createEntity();
    eOverride.addComponent(new ScriptComponent(null, [{ type: 'Spinner', fields: { rpm: 99 } }]));

    world.tick(16);
    expect(slot0(eDefault).instance!.rpm).toBe(30); // default do schema
    expect(slot0(eOverride).instance!.rpm).toBe(99); // override da cena
  });

  it('pauseWhen (modo edição) não roda os scripts', () => {
    registerScript('Spinner', Spinner);
    const world = new World();
    let editing = true;
    world.addSystem(new ScriptHostSystem({ world }, () => editing));
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'Spinner' }]));

    world.tick(16);
    expect(slot0(e).instance).toBeNull(); // nem instanciou no editor
    editing = false;
    world.tick(16);
    expect(slot0(e).instance!.starts).toBe(1); // roda ao dar Play
  });

  it('script que lança exceção não derruba o loop (logado via debug)', () => {
    registerScript('Boom', Boom);
    registerScript('Spinner', Spinner);
    const world = new World();
    world.addSystem(new ScriptHostSystem({ world }));
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'Boom' }, { type: 'Spinner' }]));

    expect(() => world.tick(16)).not.toThrow();
    // o Spinner (depois do Boom) ainda rodou
    const spinner = e.getComponent(ScriptComponent)!.scripts[1]!.instance as Spinner;
    expect(spinner.updates).toBe(1);
  });

  it('Play → Stop destrói as instâncias e o Play seguinte recria (ciclo Unity)', () => {
    registerScript('Spinner', Spinner);
    const world = new World();
    let editing = false;
    world.addSystem(new ScriptHostSystem({ world }, () => editing));
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'Spinner' }]));

    world.tick(16);
    const first = slot0(e).instance!;
    expect(first.starts).toBe(1);

    editing = true; // Stop
    world.tick(16);
    expect(first.destroyed).toBe(1); // onDestroy FINALMENTE acontece
    expect(slot0(e).instance).toBeNull();
    world.tick(16);
    expect(first.destroyed).toBe(1); // e só uma vez, não a cada frame de edição

    editing = false; // Play de novo
    world.tick(16);
    const second = slot0(e).instance!;
    expect(second).not.toBe(first); // instância NOVA, estado limpo
    expect(second.starts).toBe(1);
  });

  it('script não registrado é ignorado (some quando registrar)', () => {
    const world = new World();
    world.addSystem(new ScriptHostSystem({ world }));
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(null, [{ type: 'AindaNaoExiste' }]));
    expect(() => world.tick(16)).not.toThrow();
    expect(e.getComponent(ScriptComponent)!.scripts[0]!.instance).toBeNull();
  });
});
