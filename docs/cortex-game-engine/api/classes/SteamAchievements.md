[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SteamAchievements

# Class: SteamAchievements

Defined in: [src/core/achievements.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L57)

Conquistas na Steam. Guarda na sessão o que já foi enviado: o segundo
`unlock` do mesmo id não chama o Steamworks. Conquista marcada cujo
`storeStats` falhou fica pendente e o envio é refeito no próximo
`unlock`/`has`, até dar certo.

## Implements

- [`Achievements`](../interfaces/Achievements.md)

## Constructors

### Constructor

> **new SteamAchievements**(`steam?`): `SteamAchievements`

Defined in: [src/core/achievements.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L64)

#### Parameters

##### steam?

[`AchievementSteamPort`](../interfaces/AchievementSteamPort.md) = `Steam`

#### Returns

`SteamAchievements`

## Properties

### backend

> `readonly` **backend**: `"steam"` = `'steam'`

Defined in: [src/core/achievements.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L58)

Implementação ligada (log, testes, UI que só faz sentido com plataforma).

#### Implementation of

[`Achievements`](../interfaces/Achievements.md).[`backend`](../interfaces/Achievements.md#backend)

## Methods

### has()

> **has**(`id`): `boolean`

Defined in: [src/core/achievements.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L78)

`true` se a conquista já está desbloqueada.

#### Parameters

##### id

`string`

#### Returns

`boolean`

#### Implementation of

[`Achievements`](../interfaces/Achievements.md).[`has`](../interfaces/Achievements.md#has)

***

### unlock()

> **unlock**(`id`): `boolean`

Defined in: [src/core/achievements.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L66)

Desbloqueia a conquista. Idempotente: se ela já foi desbloqueada, não chama
a plataforma de novo.

#### Parameters

##### id

`string`

o *API Name* cadastrado na plataforma (Steamworks: Stats & Achievements).

#### Returns

`boolean`

`true` quando a conquista ficou (ou já estava) desbloqueada.

#### Implementation of

[`Achievements`](../interfaces/Achievements.md).[`unlock`](../interfaces/Achievements.md#unlock)
