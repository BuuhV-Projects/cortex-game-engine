[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BindingCaptureOptions

# Interface: BindingCaptureOptions

Defined in: [src/input/captureBinding.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L39)

## Properties

### cancelKeys?

> `optional` **cancelKeys?**: readonly `string`[]

Defined in: [src/input/captureBinding.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L51)

Teclas que CANCELAM em vez de virar binding. Default `['Escape']`.
Só vale pra família `keyboard` — no controle, cancelar por B impediria
mapear o próprio B, então o cancelamento de lá é pelo botão da tela.

***

### family

> **family**: [`CaptureFamily`](../type-aliases/CaptureFamily.md)

Defined in: [src/input/captureBinding.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L41)

Que tipo de origem capturar.

***

### gamepad?

> `optional` **gamepad?**: [`GamepadManager`](../classes/GamepadManager.md)

Defined in: [src/input/captureBinding.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L43)

Necessário pra `family: 'gamepad'`.

***

### padIndex?

> `optional` **padIndex?**: `number`

Defined in: [src/input/captureBinding.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/captureBinding.ts#L45)

Slot do gamepad. Default: o primeiro conectado.
