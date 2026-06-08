import { Component } from '../ecs/Component.js';
import type { LogicDefinition } from '../scene/LogicBricks.js';

/**
 * Bricks de lógica de um objeto (sensores/controllers/actuators) — ver
 * {@link LogicBricksSystem}. Só dados; o `_prevKey` é estado de edge (frame
 * anterior) gerenciado pelo system.
 */
export class LogicComponent extends Component {
  /** Estado anterior de teclas pra sensores `edge` (gerenciado pelo system). */
  _prevKey: Record<string, boolean> = {};

  constructor(public logic: LogicDefinition) {
    super();
  }
}
