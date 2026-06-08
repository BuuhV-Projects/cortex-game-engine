[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseLogic

# Function: parseLogic()

> **parseLogic**(`raw`): \{ `actuators`: (\{ `id`: `string`; `loc?`: \[`number`, `number`, `number`\]; `perSecond?`: `boolean`; `rot?`: \[`number`, `number`, `number`\]; `type`: `"motion"`; \} \| \{ `clip`: `string`; `id`: `string`; `loop?`: `boolean`; `type`: `"animation"`; \})[]; `controllers`: `object`[]; `sensors`: (\{ `id`: `string`; `type`: `"always"`; \} \| \{ `edge?`: `boolean`; `id`: `string`; `key`: `string`; `type`: `"key"`; \})[]; \} \| `null`

Defined in: src/scene/LogicBricks.ts:67

Valida/parseia um objeto desconhecido numa [LogicDefinition](../type-aliases/LogicDefinition.md) (ou `null`).

## Parameters

### raw

`unknown`

## Returns

\{ `actuators`: (\{ `id`: `string`; `loc?`: \[`number`, `number`, `number`\]; `perSecond?`: `boolean`; `rot?`: \[`number`, `number`, `number`\]; `type`: `"motion"`; \} \| \{ `clip`: `string`; `id`: `string`; `loop?`: `boolean`; `type`: `"animation"`; \})[]; `controllers`: `object`[]; `sensors`: (\{ `id`: `string`; `type`: `"always"`; \} \| \{ `edge?`: `boolean`; `id`: `string`; `key`: `string`; `type`: `"key"`; \})[]; \} \| `null`
