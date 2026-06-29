import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import { ScriptComponent } from '../components/ScriptComponent.js';
import type { ScriptBehavior, ScriptContext } from '../scripts/ScriptBehavior.js';
import { getScript, getScriptFields } from '../scripts/ScriptRegistry.js';
import { debug } from '../core/debug.js';

/**
 * Aplica os valores dos campos (schema default + overrides da cena/Inspector) nas
 * propriedades da instância. Usado na 1ª criação e no live-edit do Inspector.
 */
export function applyScriptFields(instance: ScriptBehavior, type: string, fields: Record<string, unknown>): void {
  const schema = getScriptFields(type);
  const target = instance as unknown as Record<string, unknown>;
  for (const [name, def] of Object.entries(schema)) {
    const v = fields[name];
    target[name] = v !== undefined ? v : def.default;
  }
}

/**
 * **Roda os scripts** ({@link ScriptBehavior}) anexados via {@link ScriptComponent} — ADR-0085.
 * Instancia cada slot pelo nome (registro), injeta `entity`/`object3d`/`ctx`, aplica os campos,
 * chama `onStart` (uma vez) e `onUpdate(dt)` (todo frame, `dt` em segundos). Um script que
 * lança exceção é logado via `debug('script', …)` e não derruba os demais.
 *
 * **Pausa no editor** (passe `isEditing`): scripts só rodam no Play, como na Unity. O jogo
 * adiciona este sistema no boot com o contexto (input/gamepad/scene/camera).
 */
export class ScriptHostSystem extends System {
  static override requiredComponents = [ScriptComponent];
  override priority = 50;

  constructor(
    private readonly ctx: ScriptContext,
    /** Quando `true`, os scripts não rodam (modo edição). */
    isEditing?: () => boolean,
  ) {
    super();
    if (isEditing) this.pauseWhen = isEditing;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000; // ms → s (scripts pensam em segundos, estilo Unity)
    for (const e of entities) {
      const comp = e.getComponent(ScriptComponent);
      if (!comp || comp.enabled === false) continue;
      for (const slot of comp.scripts) {
        if (slot.instance === null) {
          const Ctor = getScript(slot.type);
          if (!Ctor) continue; // script não registrado — ignora (some quando registrar)
          const inst = new Ctor();
          inst.entity = e;
          inst.object3d = comp.object;
          inst.ctx = this.ctx;
          applyScriptFields(inst, slot.type, slot.fields);
          slot.instance = inst;
        }
        if (!slot.started) {
          try {
            slot.instance.onStart?.();
          } catch (err) {
            debug('script', 'onStart falhou em', slot.type, err);
          }
          slot.started = true;
        }
        try {
          slot.instance.onUpdate?.(dt);
        } catch (err) {
          debug('script', 'onUpdate falhou em', slot.type, err);
        }
      }
    }
  }
}
