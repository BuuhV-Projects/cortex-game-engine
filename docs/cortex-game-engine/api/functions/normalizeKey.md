[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / normalizeKey

# Function: normalizeKey()

> **normalizeKey**(`key`): `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:60

Normaliza uma tecla pro mesmo formato do [InputManager](../classes/InputManager.md): letras (1
caractere) viram minúsculas; teclas nomeadas (`Shift`, `ArrowLeft`) passam
intactas. Sem isso, `W` (com Shift) não casaria com o binding `w`.

## Parameters

### key

`string`

## Returns

`string`
