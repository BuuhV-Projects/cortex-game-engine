[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / fireActuators

# Function: fireActuators()

> **fireActuators**(`def`, `active`): `Set`\<`string`\>

Defined in: src/systems/LogicBricksSystem.ts:33

Resolve quais actuators disparam, a partir dos controllers (and/or).

## Parameters

### def

#### actuators

(\{ `id`: `string`; `loc?`: \[`number`, `number`, `number`\]; `perSecond?`: `boolean`; `rot?`: \[`number`, `number`, `number`\]; `type`: `"motion"`; \} \| \{ `clip`: `string`; `id`: `string`; `loop?`: `boolean`; `type`: `"animation"`; \})[] = `...`

#### controllers

`object`[] = `...`

#### sensors

(\{ `id`: `string`; `type`: `"always"`; \} \| \{ `edge?`: `boolean`; `id`: `string`; `key`: `string`; `type`: `"key"`; \})[] = `...`

### active

`Record`\<`string`, `boolean`\>

## Returns

`Set`\<`string`\>
