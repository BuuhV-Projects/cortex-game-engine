[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / segmentAt

# Function: segmentAt()

> **segmentAt**(`index`, `target`): `number`

Defined in: [src/scene/Route.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L120)

Segmento que contém a distância `target` (medida do ponto 0, já em
`[0, length)`): o último ponto cuja distância acumulada não passa do alvo.
Pontos repetidos (segmento de comprimento zero) nunca são escolhidos.

## Parameters

### index

[`RouteIndex`](../interfaces/RouteIndex.md)

### target

`number`

## Returns

`number`
