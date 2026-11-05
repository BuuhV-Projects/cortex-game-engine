[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / normalizeModelUrl

# Function: normalizeModelUrl()

> **normalizeModelUrl**(`url`): `string`

Defined in: src/scene/modelHotRegistry.ts:42

Forma canônica da URL de um modelo: sem query/hash, sem `./` nem `/` no começo e
com `/` como separador. `'./assets/a.glb?t=1'` e `'/assets/a.glb'` viram `'assets/a.glb'`.

## Parameters

### url

`string`

## Returns

`string`
