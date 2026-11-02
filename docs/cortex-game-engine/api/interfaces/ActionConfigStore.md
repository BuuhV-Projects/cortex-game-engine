[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ActionConfigStore

# Interface: ActionConfigStore

Defined in: [src/input/InputActions.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L41)

O mínimo do [GameConfig](../classes/GameConfig.md) que este módulo usa (facilita teste e evita acoplamento).

## Methods

### delete()

> **delete**(`key`): `void`

Defined in: [src/input/InputActions.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L45)

#### Parameters

##### key

`string`

#### Returns

`void`

***

### get()

> **get**(`key`, `fallback?`): `string`

Defined in: [src/input/InputActions.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L42)

#### Parameters

##### key

`string`

##### fallback?

`string`

#### Returns

`string`

***

### has()

> **has**(`key`): `boolean`

Defined in: [src/input/InputActions.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L43)

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### set()

> **set**(`key`, `value`): `void`

Defined in: [src/input/InputActions.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L44)

#### Parameters

##### key

`string`

##### value

`string` \| `number` \| `boolean`

#### Returns

`void`
