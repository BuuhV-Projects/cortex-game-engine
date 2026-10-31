[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / mergeDeltas

# Function: mergeDeltas()

> **mergeDeltas**(`deltas`): `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: src/road/RoadGrade.ts:191

Combina deltas de **várias estradas** na mesma grade: vence o de **maior módulo** em
cada vértice (o corte fundo de uma não é apagado pelo talude suave de outra).

## Parameters

### deltas

readonly `Float32Array`\<`ArrayBufferLike`\>[]

## Returns

`Float32Array`\<`ArrayBufferLike`\> \| `null`

`null` se a lista está vazia.
