[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BindingCapture

# Interface: BindingCapture

Defined in: [src/input/captureBinding.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L54)

## Properties

### promise

> `readonly` **promise**: `Promise`\<[`InputBinding`](InputBinding.md) \| `null`\>

Defined in: [src/input/captureBinding.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L56)

Resolve com o binding capturado, ou `null` se cancelado.

## Methods

### cancel()

> **cancel**(): `void`

Defined in: [src/input/captureBinding.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L60)

Cancela (resolve `null`) e remove os listeners.

#### Returns

`void`

***

### tick()

> **tick**(): `void`

Defined in: [src/input/captureBinding.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L58)

Chame 1×/frame enquanto a captura estiver aberta (só afeta gamepad).

#### Returns

`void`
