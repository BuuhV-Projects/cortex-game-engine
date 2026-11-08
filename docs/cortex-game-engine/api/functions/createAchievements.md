[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createAchievements

# Function: createAchievements()

> **createAchievements**(`platform`, `steam?`): [`Achievements`](../interfaces/Achievements.md)

Defined in: [src/core/achievements.ts:131](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L131)

Escolhe a implementação pela plataforma do export. **O padrão é sempre a
[NullAchievements](../classes/NullAchievements.md)**: plataforma sem implementação (hoje `pc` e
`xbox`), valor desconhecido ou Steam indisponível caem nela, e nunca lança.
O Xbox entra com um `case 'xbox'` novo.

## Parameters

### platform

[`GamePlatform`](../type-aliases/GamePlatform.md)

### steam?

[`AchievementSteamPort`](../interfaces/AchievementSteamPort.md) = `Steam`

## Returns

[`Achievements`](../interfaces/Achievements.md)
