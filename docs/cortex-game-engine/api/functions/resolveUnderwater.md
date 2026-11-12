[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolveUnderwater

# Function: resolveUnderwater()

> **resolveUnderwater**(`state`): [`ResolvedUnderwater`](../interfaces/ResolvedUnderwater.md) \| `null`

Defined in: src/core/underwater.ts:108

Resolve o pedido do jogo nos números do shader. Devolve `null` quando o efeito
está desligado (`state` nulo ou `amount ≤ 0`).

## Parameters

### state

[`UnderwaterState`](../interfaces/UnderwaterState.md) \| `null` \| `undefined`

## Returns

[`ResolvedUnderwater`](../interfaces/ResolvedUnderwater.md) \| `null`

## Example

```ts
resolveUnderwater({ amount: 1, depth: 45 })?.brightness // 0.5
```
