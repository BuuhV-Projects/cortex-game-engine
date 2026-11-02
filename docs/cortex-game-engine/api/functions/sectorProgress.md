[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / sectorProgress

# Function: sectorProgress()

> **sectorProgress**(`position`, `route`, `start`, `end`): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/scene/Route.ts:197](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L197)

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
