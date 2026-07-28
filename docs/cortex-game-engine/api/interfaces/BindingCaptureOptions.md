[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BindingCaptureOptions

# Interface: BindingCaptureOptions

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:39

## Properties

### cancelKeys?

> `optional` **cancelKeys?**: readonly `string`[]

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:51

Teclas que CANCELAM em vez de virar binding. Default `['Escape']`.
Só vale pra família `keyboard` — no controle, cancelar por B impediria
mapear o próprio B, então o cancelamento de lá é pelo botão da tela.

***

### family

> **family**: [`CaptureFamily`](../type-aliases/CaptureFamily.md)

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:41

Que tipo de origem capturar.

***

### gamepad?

> `optional` **gamepad?**: [`GamepadManager`](../classes/GamepadManager.md)

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:43

Necessário pra `family: 'gamepad'`.

***

### padIndex?

> `optional` **padIndex?**: `number`

Defined in: .claude/worktrees/feat-input-rebind/src/input/captureBinding.ts:45

Slot do gamepad. Default: o primeiro conectado.
