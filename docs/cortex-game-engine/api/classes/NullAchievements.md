[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / NullAchievements

# Class: NullAchievements

Defined in: src/core/achievements.ts:82

Sem plataforma: guarda na sessão e registra no `debug`. Não persiste.

## Implements

- [`Achievements`](../interfaces/Achievements.md)

## Constructors

### Constructor

> **new NullAchievements**(): `NullAchievements`

#### Returns

`NullAchievements`

## Properties

### backend

> `readonly` **backend**: `"null"` = `'null'`

Defined in: src/core/achievements.ts:83

Implementação ligada (log, testes, UI que só faz sentido com plataforma).

#### Implementation of

[`Achievements`](../interfaces/Achievements.md).[`backend`](../interfaces/Achievements.md#backend)

## Methods

### has()

> **has**(`id`): `boolean`

Defined in: src/core/achievements.ts:93

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

Defined in: src/core/achievements.ts:86

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
