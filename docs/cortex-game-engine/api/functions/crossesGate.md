[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / crossesGate

# Function: crossesGate()

> **crossesGate**(`from`, `to`, `gate`): `boolean`

Defined in: src/scene/Route.ts:147

Cruzou o portal de `from` para `to`, no sentido de percurso, dentro da largura
e da altura da pista? Varrido (não perde a passagem entre frames) e só para a
frente (voltar de ré pela linha não conta).

## Parameters

### from

[`RoutePoint`](../interfaces/RoutePoint.md)

### to

[`RoutePoint`](../interfaces/RoutePoint.md)

### gate

[`RouteGate`](../interfaces/RouteGate.md)

## Returns

`boolean`

## Example

```ts
if (crossesGate(previousPosition, carPosition, finishLine)) lap++;
```
