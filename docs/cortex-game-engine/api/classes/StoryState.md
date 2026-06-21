[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / StoryState

# Class: StoryState

Defined in: src/narrative/StoryState.ts:18

## Constructors

### Constructor

> **new StoryState**(): `StoryState`

#### Returns

`StoryState`

## Methods

### apply()

> **apply**(`patch`): `void`

Defined in: src/narrative/StoryState.ts:43

Aplica um lote de flags (ex.: o `set` de um nó/escolha de diálogo).

#### Parameters

##### patch

`Readonly`\<`Record`\<`string`, [`FlagValue`](../type-aliases/FlagValue.md)\>\> \| `undefined`

#### Returns

`void`

***

### get()

> **get**(`key`): [`FlagValue`](../type-aliases/FlagValue.md) \| `undefined`

Defined in: src/narrative/StoryState.ts:22

Lê o valor cru de uma flag (ou `undefined` se nunca setada).

#### Parameters

##### key

`string`

#### Returns

[`FlagValue`](../type-aliases/FlagValue.md) \| `undefined`

***

### has()

> **has**(`key`): `boolean`

Defined in: src/narrative/StoryState.ts:32

`true` se a flag existe e é **truthy** (ligada).

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### hasAll()

> **hasAll**(`keys`): `boolean`

Defined in: src/narrative/StoryState.ts:38

`true` se **todas** as flags estão ligadas (`has`). `[]` → `true`.

#### Parameters

##### keys

readonly `string`[]

#### Returns

`boolean`

***

### set()

> **set**(`key`, `value`): `void`

Defined in: src/narrative/StoryState.ts:27

Define uma flag.

#### Parameters

##### key

`string`

##### value

[`FlagValue`](../type-aliases/FlagValue.md)

#### Returns

`void`

***

### toJSON()

> **toJSON**(): `Record`\<`string`, [`FlagValue`](../type-aliases/FlagValue.md)\>

Defined in: src/narrative/StoryState.ts:49

Serializa pra um objeto simples (save).

#### Returns

`Record`\<`string`, [`FlagValue`](../type-aliases/FlagValue.md)\>

***

### fromJSON()

> `static` **fromJSON**(`obj`): `StoryState`

Defined in: src/narrative/StoryState.ts:54

Reconstrói a partir de um objeto serializado.

#### Parameters

##### obj

`Readonly`\<`Record`\<`string`, [`FlagValue`](../type-aliases/FlagValue.md)\>\> \| `null` \| `undefined`

#### Returns

`StoryState`
