[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / bindingLabel

# Function: bindingLabel()

> **bindingLabel**(`binding`): `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:184

Rótulo legível pra mostrar na tela de Controles. Usa só glifos que a Roboto
rasteriza no console (SPEC-0165) — nada de emoji ou ícone de tecla.

## Parameters

### binding

[`InputBinding`](../interfaces/InputBinding.md)

## Returns

`string`

## Example

```ts
bindingLabel({ source: 'axis', index: 1, sign: -1 }) // 'Stick esq. cima'
```
