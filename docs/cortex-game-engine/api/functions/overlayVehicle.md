[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayVehicle

# Function: overlayVehicle()

> **overlayVehicle**(`overlay`): `Record`\<`string`, `Record`\<`string`, `unknown`\>\>

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/SceneBuilder.ts:357](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L357)

Lê `data.vehicle` da overlay — a config do **veículo** autorada no Inspector por id
(`{ [id]: VehicleConfig }`, ADR-0081). Sobrescreve o `vehicle` do nó (JSON). É só
mesclada no `userData.cortexVehicle` (o jogo lê ao criar o veículo).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, `Record`\<`string`, `unknown`\>\>
