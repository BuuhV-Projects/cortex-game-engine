[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / nearestRoutePoint

# Function: nearestRoutePoint()

> **nearestRoutePoint**(`position`, `route`, `seed?`): `number`

Defined in: src/scene/Route.ts:165

Índice do ponto de rota mais próximo (3D).

Com `seed` (o resultado da consulta anterior do MESMO corpo) varre só uma
janela em torno dele. Se o melhor da janela cair na borda, a semente ficou
velha (respawn, teleporte) e a varredura completa é feita.

## Parameters

### position

[`RoutePoint`](../interfaces/RoutePoint.md)

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

### seed?

`number` = `-1`

## Returns

`number`
