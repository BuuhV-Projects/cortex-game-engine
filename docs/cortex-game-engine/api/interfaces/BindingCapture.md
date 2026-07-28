[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BindingCapture

# Interface: BindingCapture

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:54

## Properties

### promise

> `readonly` **promise**: `Promise`\<[`InputBinding`](InputBinding.md) \| `null`\>

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:56

Resolve com o binding capturado, ou `null` se cancelado.

## Methods

### cancel()

> **cancel**(): `void`

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:60

Cancela (resolve `null`) e remove os listeners.

#### Returns

`void`

***

### tick()

> **tick**(): `void`

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:58

Chame 1×/frame enquanto a captura estiver aberta (só afeta gamepad).

#### Returns

`void`
