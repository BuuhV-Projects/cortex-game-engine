[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplate

# Class: UiTemplate

Defined in: [src/ui/runtime/UiTemplate.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L54)

Template compilado (parse 1x; `build` quantas vezes quiser).

## Constructors

### Constructor

> **new UiTemplate**(`roots`, `sheet`): `UiTemplate`

Defined in: [src/ui/runtime/UiTemplate.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L55)

#### Parameters

##### roots

`TemplateNode`[]

##### sheet

[`UiStylesheet`](UiStylesheet.md) \| `null`

#### Returns

`UiTemplate`

## Methods

### build()

> **build**(`ui`, `options?`): [`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)

Defined in: [src/ui/runtime/UiTemplate.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L61)

Instancia os widgets na camada.

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

##### options?

[`UiTemplateBuildOptions`](../interfaces/UiTemplateBuildOptions.md) = `{}`

#### Returns

[`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)
