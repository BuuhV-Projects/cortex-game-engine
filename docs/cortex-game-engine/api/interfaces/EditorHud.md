[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorHud

# Interface: EditorHud

Defined in: [src/editor/EditorHud.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorHud.ts#L8)

HUD DOM do modo editor: barra superior com instruções + coords da câmera, e
um toast. Inicia escondida — `setVisible(true)` quando o editor é ativado.

É opcional/conveniência (acopla ao DOM). Jogos que não querem o HUD do engine
podem implementar a interface EditorHud e injetar a própria versão.

## Properties

### coords

> **coords**: `HTMLSpanElement`

Defined in: [src/editor/EditorHud.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorHud.ts#L10)

***

### root

> **root**: `HTMLDivElement`

Defined in: [src/editor/EditorHud.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorHud.ts#L9)

***

### toast

> **toast**: `HTMLDivElement`

Defined in: [src/editor/EditorHud.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorHud.ts#L11)

## Methods

### setVisible()

> **setVisible**(`v`): `void`

Defined in: [src/editor/EditorHud.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorHud.ts#L12)

#### Parameters

##### v

`boolean`

#### Returns

`void`

***

### showToast()

> **showToast**(`msg`): `void`

Defined in: [src/editor/EditorHud.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorHud.ts#L13)

#### Parameters

##### msg

`string`

#### Returns

`void`
