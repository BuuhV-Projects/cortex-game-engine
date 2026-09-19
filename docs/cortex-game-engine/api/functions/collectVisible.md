[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / collectVisible

# Function: collectVisible()

> **collectVisible**(`scene`, `camera`): [`VisibleNode`](../interfaces/VisibleNode.md)[]

Defined in: src/core/PerfTrace.ts:104

Percorre a cena e agrega, por nó de cena, o que está DENTRO do frustum da
câmera. É o traverse mais caro do trace — roda uma vez por amostra, nunca por
frame.

## Parameters

### scene

`Object3D`

### camera

`Camera`

## Returns

[`VisibleNode`](../interfaces/VisibleNode.md)[]
