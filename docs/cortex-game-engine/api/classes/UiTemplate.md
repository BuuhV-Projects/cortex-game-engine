[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplate

# Class: UiTemplate

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiTemplate.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L58)

Template compilado (parse 1x; `build` quantas vezes quiser).

## Constructors

### Constructor

> **new UiTemplate**(`roots`, `sheet`): `UiTemplate`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiTemplate.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L59)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiTemplate.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L65)

Instancia os widgets na camada.

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

##### options?

[`UiTemplateBuildOptions`](../interfaces/UiTemplateBuildOptions.md) = `{}`

#### Returns

[`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)
