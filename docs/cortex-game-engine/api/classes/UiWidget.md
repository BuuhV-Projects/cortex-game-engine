[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiWidget

# Abstract Class: UiWidget

Defined in: src/ui/runtime/widgets.ts:26

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

Defined in: src/ui/runtime/widgets.ts:28

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:40

Sujo = backend precisa re-sincronizar este widget.

***

### height

> **height**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:33

***

### id

> `readonly` **id**: `number`

Defined in: src/ui/runtime/widgets.ts:27

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:38

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:37

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

***

### opacity

> **opacity**: `number` = `1`

Defined in: src/ui/runtime/widgets.ts:35

***

### visible

> **visible**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:34

***

### width

> **width**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:32

Tamanho declarado (Panel/Button). Labels medem no backend.

***

### x

> **x**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:29

***

### y

> **y**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:30

## Methods

### set()

> **set**(`props`): `this`

Defined in: src/ui/runtime/widgets.ts:43

Aplica props e marca o widget pra re-sincronização.

#### Parameters

##### props

`Partial`\<`this`\>

#### Returns

`this`
