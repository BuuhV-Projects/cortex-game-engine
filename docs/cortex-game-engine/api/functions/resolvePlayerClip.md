[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolvePlayerClip

# Function: resolvePlayerClip()

> **resolvePlayerClip**(`clipNames`, `map`, `action`): `string` \| `null`

Defined in: [src/systems/PlatformerAnimationSystem.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerAnimationSystem.ts#L62)

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
