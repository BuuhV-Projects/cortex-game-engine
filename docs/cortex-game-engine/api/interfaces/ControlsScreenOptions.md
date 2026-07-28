[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ControlsScreenOptions

# Interface: ControlsScreenOptions

Defined in: [src/input/ControlsScreen.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L93)

## Properties

### config?

> `optional` **config?**: [`ActionConfigStore`](ActionConfigStore.md) & `object`

Defined in: [src/input/ControlsScreen.ts:97](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L97)

Onde persistir (tipicamente o `GameConfig`); sem ele, o remapeamento vale só na sessão.

#### Type Declaration

##### save()

> **save**(): `Promise`\<`boolean`\>

###### Returns

`Promise`\<`boolean`\>

***

### driveUi?

> `optional` **driveUi?**: `boolean`

Defined in: [src/input/ControlsScreen.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L108)

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

Defined in: [src/input/ControlsScreen.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L99)

Necessário pra capturar botões/eixos do controle (tipicamente `game.gamepad`).

***

### groups?

> `optional` **groups?**: readonly `string`[]

Defined in: [src/input/ControlsScreen.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L95)

Grupos exibidos, na ordem. Default: movimento, ação e interface.

***

### theme?

> `optional` **theme?**: `Partial`\<\{ `capture`: `"#ffd24a"`; `cellBackground`: `"#12263c"`; `cellBorder`: `"#ffffff2e"`; `cellFocus`: `"#2f7fd0"`; `cellText`: `"#eaf4ff"`; `footer`: `"#9fb4c8"`; `header`: `"#8fd0ff"`; `label`: `"#dbe7f2"`; `scrim`: `"#050c17"`; `scrimOpacity`: `0.82`; `title`: `"#ffffff"`; \}\>

Defined in: [src/input/ControlsScreen.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L110)

Cores (parcial — o resto vem do tema neutro da engine).

***

### translate?

> `optional` **translate?**: (`key`) => `string`

Defined in: [src/input/ControlsScreen.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/ControlsScreen.ts#L101)

Tradutor (ex.: o `t` do i18n). Chave sem tradução cai no texto pt-BR embutido.

#### Parameters

##### key

`string`

#### Returns

`string`
