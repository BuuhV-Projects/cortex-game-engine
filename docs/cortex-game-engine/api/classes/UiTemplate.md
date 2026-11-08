[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplate

# Class: UiTemplate

Defined in: [src/ui/runtime/UiTemplate.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L63)

Template compilado (parse 1x; `build` quantas vezes quiser).

## Constructors

### Constructor

> **new UiTemplate**(`roots`, `sheet`): `UiTemplate`

Defined in: [src/ui/runtime/UiTemplate.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L64)

#### Parameters

##### roots

`TemplateNode`[]

##### sheet

[`UiStylesheet`](UiStylesheet.md) \| `null`

#### Returns

`UiTemplate`

## Accessors

### fontFaces

#### Get Signature

> **get** **fontFaces**(): readonly [`UiFontFace`](../interfaces/UiFontFace.md)[]

Defined in: [src/ui/runtime/UiTemplate.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L70)

`@font-face` do `<style>` (registre com `loadUiFont` antes do `build`).

##### Returns

readonly [`UiFontFace`](../interfaces/UiFontFace.md)[]

## Methods

### build()

> **build**(`ui`, `options?`): [`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)

Defined in: [src/ui/runtime/UiTemplate.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L75)

Instancia os widgets na camada.

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

##### options?

[`UiTemplateBuildOptions`](../interfaces/UiTemplateBuildOptions.md) = `{}`

#### Returns

[`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)
