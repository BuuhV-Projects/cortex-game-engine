[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createAchievements

# Function: createAchievements()

> **createAchievements**(`platform`, `steam?`): [`Achievements`](../interfaces/Achievements.md)

Defined in: src/core/achievements.ts:102

Escolhe a implementação pela plataforma do export. O ramo `xbox` existe para
a implementação do GDK entrar só aqui.

## Parameters

### platform

[`GamePlatform`](../type-aliases/GamePlatform.md)

### steam?

[`AchievementSteamPort`](../interfaces/AchievementSteamPort.md) = `Steam`

## Returns

[`Achievements`](../interfaces/Achievements.md)
