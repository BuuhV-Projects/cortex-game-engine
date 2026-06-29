[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptContext

# Interface: ScriptContext

Defined in: src/scripts/ScriptBehavior.ts:29

Handles do engine injetados em cada script pelo [ScriptHostSystem](../classes/ScriptHostSystem.md) (via `this.ctx`).
É o "ambiente" que o comportamento enxerga — sem precisar de glue no `main.ts`.

## Properties

### camera?

> `optional` **camera?**: `Camera`

Defined in: src/scripts/ScriptBehavior.ts:34

***

### gamepad?

> `optional` **gamepad?**: [`GamepadManager`](../classes/GamepadManager.md)

Defined in: src/scripts/ScriptBehavior.ts:32

***

### input?

> `optional` **input?**: [`InputManager`](../classes/InputManager.md)

Defined in: src/scripts/ScriptBehavior.ts:31

***

### scene?

> `optional` **scene?**: [`Scene`](../classes/Scene.md)

Defined in: src/scripts/ScriptBehavior.ts:33

***

### world

> **world**: [`World`](../classes/World.md)

Defined in: src/scripts/ScriptBehavior.ts:30
