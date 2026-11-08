[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AchievementSteamPort

# Interface: AchievementSteamPort

Defined in: src/core/achievements.ts:44

Recorte da fachada [Steam](../variables/Steam.md) que as conquistas usam (injetável nos testes).

## Methods

### hasAchievement()

> **hasAchievement**(`id`): `boolean`

Defined in: src/core/achievements.ts:47

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### isAvailable()

> **isAvailable**(): `boolean`

Defined in: src/core/achievements.ts:45

#### Returns

`boolean`

***

### storeStats()

> **storeStats**(): `boolean`

Defined in: src/core/achievements.ts:48

#### Returns

`boolean`

***

### unlockAchievement()

> **unlockAchievement**(`id`): `boolean`

Defined in: src/core/achievements.ts:46

#### Parameters

##### id

`string`

#### Returns

`boolean`
