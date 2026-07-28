[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ActionDef

# Interface: ActionDef

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:17

Definição de uma ação remapeável.

## Properties

### defaults

> `readonly` **defaults**: readonly [`InputBinding`](InputBinding.md)[]

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:27

Bindings de fábrica.

***

### group

> `readonly` **group**: `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:21

Seção na tela de Controles. Jogos podem usar grupos próprios.

***

### hidden?

> `readonly` `optional` **hidden?**: `boolean`

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:32

`true` esconde a ação da tela de Controles (o jogo ainda a lê normalmente).
Útil pra ações internas que não devem ser remapeadas.

***

### id

> `readonly` **id**: `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:19

Id estável (chave no `config.ini`). Em inglês, camelCase.

***

### label

> `readonly` **label**: `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:25

Rótulo pt-BR usado quando não há tradução carregada pra `labelKey`.

***

### labelKey

> `readonly` **labelKey**: `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/defaultActions.ts:23

Chave i18n do rótulo (`t(labelKey)`).
