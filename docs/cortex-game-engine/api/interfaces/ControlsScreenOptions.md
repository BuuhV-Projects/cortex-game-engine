[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ControlsScreenOptions

# Interface: ControlsScreenOptions

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:86

## Properties

### config?

> `optional` **config?**: [`ActionConfigStore`](ActionConfigStore.md) & `object`

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:90

Onde persistir (tipicamente o `GameConfig`); sem ele, o remapeamento vale só na sessão.

#### Type Declaration

##### save()

> **save**(): `Promise`\<`boolean`\>

###### Returns

`Promise`\<`boolean`\>

***

### driveUi?

> `optional` **driveUi?**: `boolean`

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:101

A tela roda o próprio loop de `ui.update`/`ui.render`? Deixe `true` quando
o `Game` está parado (menu de título) e `false` quando ele já está rodando
(menu de pausa) — senão a UI atualiza duas vezes por frame.

#### Default

```ts
true
```

***

### gamepad?

> `optional` **gamepad?**: [`GamepadManager`](../classes/GamepadManager.md)

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:92

Necessário pra capturar botões/eixos do controle (tipicamente `game.gamepad`).

***

### groups?

> `optional` **groups?**: readonly `string`[]

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:88

Grupos exibidos, na ordem. Default: movimento, ação e interface.

***

### theme?

> `optional` **theme?**: `Partial`\<\{ `capture`: `"#ffd24a"`; `cellBackground`: `"#12263c"`; `cellBorder`: `"#ffffff2e"`; `cellFocus`: `"#2f7fd0"`; `cellText`: `"#eaf4ff"`; `footer`: `"#9fb4c8"`; `header`: `"#8fd0ff"`; `label`: `"#dbe7f2"`; `scrim`: `"#050c17"`; `scrimOpacity`: `0.82`; `title`: `"#ffffff"`; \}\>

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:103

Cores (parcial — o resto vem do tema neutro da engine).

***

### translate?

> `optional` **translate?**: (`key`) => `string`

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:94

Tradutor (ex.: o `t` do i18n). Chave sem tradução cai no texto pt-BR embutido.

#### Parameters

##### key

`string`

#### Returns

`string`
