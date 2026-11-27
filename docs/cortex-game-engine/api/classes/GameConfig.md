[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameConfig

# Class: GameConfig

Defined in: [src/i18n/GameConfig.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L107)

Config do jogo carregada do `config.ini` (+ overlay do `localStorage` em
dev). Ver o cabeçalho do módulo pro formato e a estratégia de persistência.

## Properties

### file

> `readonly` **file**: `string`

Defined in: [src/i18n/GameConfig.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L110)

Nome/URL do arquivo (relativo à raiz do jogo).

## Methods

### delete()

> **delete**(`key`): `void`

Defined in: [src/i18n/GameConfig.ts:181](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L181)

Remove uma chave.

#### Parameters

##### key

`string`

#### Returns

`void`

***

### get()

> **get**(`key`, `fallback?`): `string`

Defined in: [src/i18n/GameConfig.ts:149](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L149)

Valor cru da chave (`secao.chave`), ou `fallback` se ausente.

#### Parameters

##### key

`string`

##### fallback?

`string` = `''`

#### Returns

`string`

***

### getBool()

> **getBool**(`key`, `fallback?`): `boolean`

Defined in: [src/i18n/GameConfig.ts:154](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L154)

Valor booleano: aceita `true/false`, `1/0`, `on/off`, `yes/no`.

#### Parameters

##### key

`string`

##### fallback?

`boolean` = `false`

#### Returns

`boolean`

***

### getNumber()

> **getNumber**(`key`, `fallback?`): `number`

Defined in: [src/i18n/GameConfig.ts:163](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L163)

Valor numérico; `fallback` se ausente ou não numérico.

#### Parameters

##### key

`string`

##### fallback?

`number` = `0`

#### Returns

`number`

***

### has()

> **has**(`key`): `boolean`

Defined in: [src/i18n/GameConfig.ts:171](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L171)

`true` se a chave existe no arquivo/overlay.

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### save()

> **save**(): `Promise`\<`boolean`\>

Defined in: [src/i18n/GameConfig.ts:189](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L189)

Persiste: arquivo real no host nativo, `localStorage` em dev. Retorna
`false` se nenhum destino de escrita estiver disponível.

#### Returns

`Promise`\<`boolean`\>

***

### set()

> **set**(`key`, `value`): `void`

Defined in: [src/i18n/GameConfig.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L176)

Define uma chave (persiste só depois do [save](#save)).

#### Parameters

##### key

`string`

##### value

`string` \| `number` \| `boolean`

#### Returns

`void`

***

### load()

> `static` **load**(`file?`): `Promise`\<`GameConfig`\>

Defined in: [src/i18n/GameConfig.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L118)

Carrega o `config.ini` da raiz do jogo. Arquivo ausente não é erro — volta
uma config vazia (os `get*` respondem com os fallbacks do jogo).

#### Parameters

##### file?

`string` = `'config.ini'`

#### Returns

`Promise`\<`GameConfig`\>
