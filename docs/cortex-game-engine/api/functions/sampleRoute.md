[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / sampleRoute

# Function: sampleRoute()

> **sampleRoute**(`route`, `index`, `distance`, `out?`): [`RoutePoint`](../interfaces/RoutePoint.md)

Defined in: src/scene/Route.ts:263

Ponto a `distance` metros (pode ser negativo) do ponto `index`, ao longo da
rota, dando a volta no circuito.

## Parameters

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

### index

`number`

### distance

`number`

### out?

[`RoutePoint`](../interfaces/RoutePoint.md)

recicla o ponto devolvido — passe um buffer ao amostrar em laço.

## Returns

[`RoutePoint`](../interfaces/RoutePoint.md)
