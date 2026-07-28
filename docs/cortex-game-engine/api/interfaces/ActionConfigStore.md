[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ActionConfigStore

# Interface: ActionConfigStore

Defined in: .claude/worktrees/feat-input-rebind/src/input/InputActions.ts:41

O mínimo do [GameConfig](../classes/GameConfig.md) que este módulo usa (facilita teste e evita acoplamento).

## Methods

### delete()

> **delete**(`key`): `void`

Defined in: .claude/worktrees/feat-input-rebind/src/input/InputActions.ts:45

#### Parameters

##### key

`string`

#### Returns

`void`

***

### get()

> **get**(`key`, `fallback?`): `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/InputActions.ts:42

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

Defined in: .claude/worktrees/feat-input-rebind/src/input/InputActions.ts:43

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### set()

> **set**(`key`, `value`): `void`

Defined in: .claude/worktrees/feat-input-rebind/src/input/InputActions.ts:44

#### Parameters

##### key

`string`

##### value

`string` \| `number` \| `boolean`

#### Returns

`void`
