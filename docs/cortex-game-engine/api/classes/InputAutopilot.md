[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InputAutopilot

# Class: InputAutopilot

Defined in: [src/input/InputAutopilot.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L118)

## Constructors

### Constructor

> **new InputAutopilot**(`profile`, `profileName?`): `InputAutopilot`

Defined in: [src/input/InputAutopilot.ts:136](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L136)

#### Parameters

##### profile

[`AutopilotProfile`](../interfaces/AutopilotProfile.md)

##### profileName?

`string` = `''`

#### Returns

`InputAutopilot`

## Properties

### cycleS

> `readonly` **cycleS**: `number`

Defined in: [src/input/InputAutopilot.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L120)

Seconds of one full loop of the profile.

***

### profileName

> `readonly` **profileName**: `string` = `''`

Defined in: [src/input/InputAutopilot.ts:136](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L136)

## Accessors

### stepIndex

#### Get Signature

> **get** **stepIndex**(): `number`

Defined in: [src/input/InputAutopilot.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L145)

Index of the step being played.

##### Returns

`number`

## Methods

### getGamepads()

> **getGamepads**(): readonly (`VirtualPad` \| `null`)[]

Defined in: [src/input/InputAutopilot.ts:150](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L150)

The virtual pad as `navigator.getGamepads()` returns it.

#### Returns

readonly (`VirtualPad` \| `null`)[]

***

### install()

> **install**(`nav?`): () => `void`

Defined in: [src/input/InputAutopilot.ts:172](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L172)

Replaces `navigator.getGamepads` with the virtual pad (real pads hidden).
Returns the function that puts the original back.

#### Parameters

##### nav?

###### getGamepads?

() => `unknown`

#### Returns

() => `void`

***

### step()

> **step**(`dt`): `void`

Defined in: [src/input/InputAutopilot.ts:155](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L155)

Advances the script by `dt` seconds of game clock.

#### Parameters

##### dt

`number`

#### Returns

`void`
