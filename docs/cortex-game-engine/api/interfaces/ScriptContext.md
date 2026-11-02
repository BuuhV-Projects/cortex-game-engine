[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptContext

# Interface: ScriptContext

Defined in: [src/scripts/ScriptBehavior.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L35)

Handles do engine injetados em cada script pelo [ScriptHostSystem](../classes/ScriptHostSystem.md) (via `this.ctx`).
É o "ambiente" que o comportamento enxerga — sem precisar de glue no `main.ts`.

## Properties

### camera?

> `optional` **camera?**: `Camera`

Defined in: [src/scripts/ScriptBehavior.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L40)

***

### gamepad?

> `optional` **gamepad?**: [`GamepadManager`](../classes/GamepadManager.md)

Defined in: [src/scripts/ScriptBehavior.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L38)

***

### input?

> `optional` **input?**: [`InputManager`](../classes/InputManager.md)

Defined in: [src/scripts/ScriptBehavior.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L37)

***

### scene?

> `optional` **scene?**: [`Scene`](../classes/Scene.md)

Defined in: [src/scripts/ScriptBehavior.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L39)

***

### world

> **world**: [`World`](../classes/World.md)

Defined in: [src/scripts/ScriptBehavior.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L36)
