[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayVehicle

# Function: overlayVehicle()

> **overlayVehicle**(`overlay`): `Record`\<`string`, `Record`\<`string`, `unknown`\>\>

Defined in: [src/scene/SceneBuilder.ts:280](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L280)

Lê `data.vehicle` da overlay — a config do **veículo** autorada no Inspector por id
(`{ [id]: VehicleConfig }`, ADR-0081). Sobrescreve o `vehicle` do nó (JSON). É só
mesclada no `userData.cortexVehicle` (o jogo lê ao criar o veículo).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, `Record`\<`string`, `unknown`\>\>
