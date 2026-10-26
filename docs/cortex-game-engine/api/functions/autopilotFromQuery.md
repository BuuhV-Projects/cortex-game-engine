[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / autopilotFromQuery

# Function: autopilotFromQuery()

> **autopilotFromQuery**(`search`): [`InputAutopilot`](../classes/InputAutopilot.md) \| `null`

Defined in: [src/input/InputAutopilot.ts:223](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L223)

Builds the autopilot asked by `?autopilot=<profile>`, or `null` without it.
Throws on an unknown profile: a dead round beats a parked one labelled "moving".

## Parameters

### search

`string`

## Returns

[`InputAutopilot`](../classes/InputAutopilot.md) \| `null`
