[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / routeSeparation

# Function: routeSeparation()

> **routeSeparation**(`route`, `from`, `to`): `number`

Defined in: src/scene/Route.ts:327

Distância COM SINAL de `from` até `to` ao longo do circuito, pelo caminho
mais curto — atravessa a linha de chegada sem saltar um perímetro inteiro.
Positivo = `to` está à frente.

## Parameters

### route

readonly [`RoutePoint`](../interfaces/RoutePoint.md)[]

### from

[`RoutePosition`](../interfaces/RoutePosition.md)

### to

[`RoutePosition`](../interfaces/RoutePosition.md)

## Returns

`number`

## Example

```ts
// Quem está na frente, e por quantos metros:
const gap = routeSeparation(route, me, rival);
```
