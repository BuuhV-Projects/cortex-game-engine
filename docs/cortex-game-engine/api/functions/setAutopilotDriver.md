[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setAutopilotDriver

# Function: setAutopilotDriver()

> **setAutopilotDriver**(`driver`): `void`

Defined in: [src/input/InputAutopilot.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L80)

Registers the driver that `driver` steps (the `drive` profile) read every frame, or clears it
with `null`. The engine knows nothing about streets: the game steers.

## Parameters

### driver

[`AutopilotDriver`](../type-aliases/AutopilotDriver.md) \| `null`

## Returns

`void`

## Example

```ts
setAutopilotDriver((dt) => ({ steer: aimAt(target), throttle: 1, brake: 0 }));
```
