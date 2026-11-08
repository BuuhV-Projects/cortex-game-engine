[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SteamAchievements

# Class: SteamAchievements

Defined in: src/core/achievements.ts:55

Conquistas na Steam. Guarda na sessão o que já está desbloqueado: o segundo
`unlock` do mesmo id não chama o Steamworks.

## Implements

- [`Achievements`](../interfaces/Achievements.md)

## Constructors

### Constructor

> **new SteamAchievements**(`steam?`): `SteamAchievements`

Defined in: src/core/achievements.ts:59

#### Parameters

##### steam?

[`AchievementSteamPort`](../interfaces/AchievementSteamPort.md) = `Steam`

#### Returns

`SteamAchievements`

## Properties

### backend

> `readonly` **backend**: `"steam"` = `'steam'`

Defined in: src/core/achievements.ts:56

Implementação ligada (log, testes, UI que só faz sentido com plataforma).

#### Implementation of

[`Achievements`](../interfaces/Achievements.md).[`backend`](../interfaces/Achievements.md#backend)

## Methods

### has()

> **has**(`id`): `boolean`

Defined in: src/core/achievements.ts:73

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

Defined in: src/core/achievements.ts:61

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
