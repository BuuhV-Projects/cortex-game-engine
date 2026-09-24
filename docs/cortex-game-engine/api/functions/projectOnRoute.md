[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / projectOnRoute

# Function: projectOnRoute()

> **projectOnRoute**(`position`, `route`, `nearest`): [`RoutePosition`](../interfaces/RoutePosition.md)

Defined in: [src/scene/Route.ts:230](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L230)

Projeta `position` num dos dois segmentos que tocam o ponto `nearest` (ver
[nearestRoutePoint](nearestRoutePoint.md)). O `offset` é horizontal, compatível com
[sampleRoute](sampleRoute.md) e [routeSeparation](routeSeparation.md).

## Parameters

### position

[`RoutePoint`](../interfaces/RoutePoint.md)

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

### nearest

`number`

## Returns

[`RoutePosition`](../interfaces/RoutePosition.md)
