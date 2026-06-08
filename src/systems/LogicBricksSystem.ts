import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { InputManager } from '../core/InputManager.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { LogicComponent } from '../components/LogicComponent.js';
import type { LogicDefinition } from '../scene/LogicBricks.js';
import type { SceneAnimator } from '../scene/SceneAnimator.js';

/** Avalia quais sensores estão ativos neste frame (mutando o estado de edge). */
export function evalSensors(
  def: LogicDefinition,
  isDown: (key: string) => boolean,
  prevKey: Record<string, boolean>,
): Record<string, boolean> {
  const active: Record<string, boolean> = {};
  for (const s of def.sensors) {
    if (s.type === 'always') {
      active[s.id] = true;
    } else {
      const down = isDown(s.key);
      if (s.edge) {
        active[s.id] = down && !prevKey[s.id];
        prevKey[s.id] = down;
      } else {
        active[s.id] = down;
      }
    }
  }
  return active;
}

/** Resolve quais actuators disparam, a partir dos controllers (and/or). */
export function fireActuators(def: LogicDefinition, active: Record<string, boolean>): Set<string> {
  const fire = new Set<string>();
  for (const c of def.controllers) {
    const linked = c.sensors.map((id) => active[id] ?? false);
    const ok =
      (c.op ?? 'and') === 'or' ? linked.some(Boolean) : linked.length > 0 && linked.every(Boolean);
    if (ok) for (const a of c.actuators) fire.add(a);
  }
  return fire;
}

/**
 * Interpreta os **Logic Bricks** (ver {@link LogicComponent}): a cada frame avalia
 * sensores → controllers → actuators, e executa as ações (motion: move/gira o
 * objeto; animation: toca um clipe no `SceneAnimator`). É o runtime do editor de
 * lógica estilo UPBGE. Precisa do {@link InputManager} (sensores de tecla).
 */
export class LogicBricksSystem extends System {
  static override requiredComponents = [Object3DComponent, LogicComponent];
  override priority = 25;

  constructor(private readonly input: InputManager) {
    super();
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    for (const e of entities) {
      const obj = e.getComponent(Object3DComponent)!.object;
      const lc = e.getComponent(LogicComponent)!;
      const def = lc.logic;

      const active = evalSensors(def, (k) => this.input.isKeyDown(k), lc._prevKey);
      const fire = fireActuators(def, active);

      for (const a of def.actuators) {
        if (!fire.has(a.id)) continue;
        if (a.type === 'motion') {
          const k = a.perSecond === false ? 1 : dt;
          if (a.loc) {
            obj.position.set(obj.position.x + a.loc[0] * k, obj.position.y + a.loc[1] * k, obj.position.z + a.loc[2] * k);
          }
          if (a.rot) {
            obj.rotation.set(obj.rotation.x + a.rot[0] * k, obj.rotation.y + a.rot[1] * k, obj.rotation.z + a.rot[2] * k);
          }
        } else if (a.type === 'animation') {
          const an = (obj.userData as Record<string, unknown>)['cortexAnim'] as SceneAnimator | undefined;
          an?.play(a.clip, { loop: a.loop ?? true });
        }
      }
    }
  }
}
