[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameConfig

# Class: GameConfig

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L102)

Config do jogo carregada do `config.ini` (+ overlay do `localStorage` em
dev). Ver o cabeçalho do módulo pro formato e a estratégia de persistência.

## Properties

### file

> `readonly` **file**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:105](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L105)

Nome/URL do arquivo (relativo à raiz do jogo).

## Methods

### delete()

> **delete**(`key`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:170](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L170)

Remove uma chave.

#### Parameters

##### key

`string`

#### Returns

`void`

***

### get()

> **get**(`key`, `fallback?`): `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:138](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L138)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L143)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:152](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L152)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:160](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L160)

`true` se a chave existe no arquivo/overlay.

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### save()

> **save**(): `Promise`\<`boolean`\>

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:178](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L178)

Persiste: arquivo real no host nativo, `localStorage` em dev. Retorna
`false` se nenhum destino de escrita estiver disponível.

#### Returns

`Promise`\<`boolean`\>

***

### set()

> **set**(`key`, `value`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:165](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L165)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/i18n/GameConfig.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/GameConfig.ts#L113)

Carrega o `config.ini` da raiz do jogo. Arquivo ausente não é erro — volta
uma config vazia (os `get*` respondem com os fallbacks do jogo).

#### Parameters

##### file?

`string` = `'config.ini'`

#### Returns

`Promise`\<`GameConfig`\>
