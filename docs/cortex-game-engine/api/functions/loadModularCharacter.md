[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadModularCharacter

# Function: loadModularCharacter()

> **loadModularCharacter**(`rigUrl`, `partUrls`): `Promise`\<[`ModularCharacter`](../interfaces/ModularCharacter.md)\>

Defined in: src/scene/ModularCharacter.ts:102

Carrega o rig e as peças por URL (com o cache do [loadGLB](loadGLB.md)) e compõe o
personagem modular. Atalho assíncrono pra [composeModularCharacter](composeModularCharacter.md).

## Parameters

### rigUrl

`string`

URL do `.glb` do rig (esqueleto + animações).

### partUrls

`string`[]

URLs dos `.glb` das peças, na ordem de montagem.

## Returns

`Promise`\<[`ModularCharacter`](../interfaces/ModularCharacter.md)\>
