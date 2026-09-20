[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / nextFrame

# Function: nextFrame()

> **nextFrame**(): `Promise`\<`void`\>

Defined in: [src/core/frameYield.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L36)

Cede o controle até o próximo frame. Sem `requestAnimationFrame` (Node,
testes) resolve na hora, sem esperar nada.

## Returns

`Promise`\<`void`\>
