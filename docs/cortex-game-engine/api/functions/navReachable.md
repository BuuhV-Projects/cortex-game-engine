[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / navReachable

# Function: navReachable()

> **navReachable**(`graph`, `fromId`): `Set`\<`string`\>

Defined in: [src/road/navGraph.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/navGraph.ts#L90)

Nós alcançáveis a partir de `fromId` (BFS, trata arestas como bidirecionais salvo `oneway`).

## Parameters

### graph

[`NavGraph`](../interfaces/NavGraph.md)

### fromId

`string`

## Returns

`Set`\<`string`\>
