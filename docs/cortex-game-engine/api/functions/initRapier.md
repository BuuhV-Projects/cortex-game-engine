[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / initRapier

# Function: initRapier()

> **initRapier**(): `Promise`\<`void`\>

Defined in: [src/physics/RapierPhysics.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L79)

Carrega o Rapier (dynamic import do chunk `rapier.js`) e inicializa o WASM —
uma vez só, idempotente. Chamado por [RapierPhysics.create](../classes/RapierPhysics.md#create).

## Returns

`Promise`\<`void`\>
