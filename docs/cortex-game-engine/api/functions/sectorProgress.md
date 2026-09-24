[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / sectorProgress

# Function: sectorProgress()

> **sectorProgress**(`position`, `route`, `start`, `end`): `number`

Defined in: src/scene/Route.ts:197

Fração `[0, 1]` percorrida do setor `start` → `end`, projetando só nos
segmentos DO setor — uma curva vizinha da pista não pode dar progresso.

## Parameters

### position

[`RoutePoint`](../interfaces/RoutePoint.md)

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

### start

`number`

### end

`number`

## Returns

`number`
