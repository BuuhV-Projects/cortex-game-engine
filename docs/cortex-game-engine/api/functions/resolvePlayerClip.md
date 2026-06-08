[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolvePlayerClip

# Function: resolvePlayerClip()

> **resolvePlayerClip**(`clipNames`, `map`, `action`): `string` \| `null`

Defined in: src/systems/PlatformerAnimationSystem.ts:62

Resolve o clipe real de uma ação (com fallback run↔walk, fall↔jump, land→idle), ou `null`.

## Parameters

### clipNames

readonly `string`[]

### map

`Record`\<`string`, `string`\>

### action

`string`

## Returns

`string` \| `null`
