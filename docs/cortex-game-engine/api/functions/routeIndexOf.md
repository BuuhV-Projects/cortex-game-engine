[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / routeIndexOf

# Function: routeIndexOf()

> **routeIndexOf**(`route`): [`RouteIndex`](../interfaces/RouteIndex.md)

Defined in: src/scene/Route.ts:106

Índice da rota, calculado na primeira chamada e guardado num `WeakMap` com a
própria rota como chave.

⚠️ A rota é tratada como **imutável**: mudar os pontos depois da primeira
consulta deixa o índice velho. Para uma rota nova, passe um array novo.

## Parameters

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

## Returns

[`RouteIndex`](../interfaces/RouteIndex.md)
