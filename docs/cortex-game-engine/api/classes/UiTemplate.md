[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplate

# Class: UiTemplate

Defined in: [src/ui/runtime/UiTemplate.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L61)

Template compilado (parse 1x; `build` quantas vezes quiser).

## Constructors

### Constructor

> **new UiTemplate**(`roots`, `sheet`): `UiTemplate`

Defined in: [src/ui/runtime/UiTemplate.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L62)

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

Defined in: [src/ui/runtime/UiTemplate.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L68)

Instancia os widgets na camada.

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

##### options?

[`UiTemplateBuildOptions`](../interfaces/UiTemplateBuildOptions.md) = `{}`

#### Returns

[`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)
