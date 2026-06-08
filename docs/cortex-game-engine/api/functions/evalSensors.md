[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / evalSensors

# Function: evalSensors()

> **evalSensors**(`def`, `isDown`, `prevKey`): `Record`\<`string`, `boolean`\>

Defined in: src/systems/LogicBricksSystem.ts:10

Avalia quais sensores estão ativos neste frame (mutando o estado de edge).

## Parameters

### def

#### actuators

(\{ `id`: `string`; `loc?`: \[`number`, `number`, `number`\]; `perSecond?`: `boolean`; `rot?`: \[`number`, `number`, `number`\]; `type`: `"motion"`; \} \| \{ `clip`: `string`; `id`: `string`; `loop?`: `boolean`; `type`: `"animation"`; \})[] = `...`

#### controllers

`object`[] = `...`

#### sensors

(\{ `id`: `string`; `type`: `"always"`; \} \| \{ `edge?`: `boolean`; `id`: `string`; `key`: `string`; `type`: `"key"`; \})[] = `...`

### isDown

(`key`) => `boolean`

### prevKey

`Record`\<`string`, `boolean`\>

## Returns

`Record`\<`string`, `boolean`\>
