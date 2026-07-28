[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiWidget

# Abstract Class: UiWidget

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L26)

Base dos widgets: identidade, âncora/offset/tamanho e flag de sujeira.

## Extended by

- [`UiPanel`](UiPanel.md)
- [`UiLabel`](UiLabel.md)

## Constructors

### Constructor

> **new UiWidget**(): `UiWidget`

#### Returns

`UiWidget`

## Properties

### anchor

> **anchor**: [`UiAnchor`](../type-aliases/UiAnchor.md) = `'top-left'`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L28)

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L40)

Sujo = backend precisa re-sincronizar este widget.

***

### height

> **height**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L33)

***

### id

> `readonly` **id**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L27)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L38)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L37)

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

***

### opacity

> **opacity**: `number` = `1`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L35)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L34)

***

### width

> **width**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L32)

Tamanho declarado (Panel/Button). Labels medem no backend.

***

### x

> **x**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L29)

***

### y

> **y**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L30)

## Methods

### set()

> **set**(`props`): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L43)

Aplica props e marca o widget pra re-sincronização.

#### Parameters

##### props

`Partial`\<`this`\>

#### Returns

`this`
