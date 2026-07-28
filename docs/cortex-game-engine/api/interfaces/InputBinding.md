[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InputBinding

# Interface: InputBinding

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:27

Uma origem física que ativa uma ação.

## Properties

### index?

> `readonly` `optional` **index?**: `number`

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:30

Botão/eixo (`pad`, `axis`, `mouse`) — ignorado quando `source` é `key`.

***

### key?

> `readonly` `optional` **key?**: `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:32

Tecla (`KeyboardEvent.key` normalizado) — só quando `source` é `key`.

***

### sign?

> `readonly` `optional` **sign?**: `1` \| `-1`

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:34

Sentido do eixo: `+1` ou `-1` — só quando `source` é `axis`.

***

### source

> `readonly` **source**: [`BindingSource`](../type-aliases/BindingSource.md)

Defined in: .claude/worktrees/feat-input-rebind/src/input/bindings.ts:28
