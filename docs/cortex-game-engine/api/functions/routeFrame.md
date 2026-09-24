[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / routeFrame

# Function: routeFrame()

> **routeFrame**(`route`, `index`, `distance`, `out?`): `object`

Defined in: src/scene/Route.ts:305

Quadro local da pista a `distance` metros de `index`: o ponto e a direção
horizontal unitária `(dx, dz)` de percurso. A lateral é `(-dz, dx)`.

## Parameters

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

### index

`number`

### distance

`number`

### out?

[`RoutePoint`](../interfaces/RoutePoint.md)

recicla o ponto devolvido.

## Returns

`object`

### dx

> **dx**: `number`

### dz

> **dz**: `number`

### point

> **point**: [`RoutePoint`](../interfaces/RoutePoint.md)
