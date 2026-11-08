[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Achievements

# Interface: Achievements

Defined in: [src/core/achievements.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L29)

Conquistas do jogo, independentes da plataforma.

## Properties

### backend

> `readonly` **backend**: [`AchievementBackend`](../type-aliases/AchievementBackend.md)

Defined in: [src/core/achievements.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L31)

Implementação ligada (log, testes, UI que só faz sentido com plataforma).

## Methods

### has()

> **has**(`id`): `boolean`

Defined in: [src/core/achievements.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L40)

`true` se a conquista já está desbloqueada.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### unlock()

> **unlock**(`id`): `boolean`

Defined in: [src/core/achievements.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/achievements.ts#L38)

Desbloqueia a conquista. Idempotente: se ela já foi desbloqueada, não chama
a plataforma de novo.

#### Parameters

##### id

`string`

o *API Name* cadastrado na plataforma (Steamworks: Stats & Achievements).

#### Returns

`boolean`

`true` quando a conquista ficou (ou já estava) desbloqueada.
