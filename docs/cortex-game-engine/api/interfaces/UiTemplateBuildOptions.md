[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplateBuildOptions

# Interface: UiTemplateBuildOptions

Defined in: [src/ui/runtime/UiTemplate.ts:183](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L183)

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: [src/ui/runtime/UiTemplate.ts:185](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L185)

Valores pra `{{chave}}` nos textos.

***

### onAction?

> `optional` **onAction?**: (`action`, `button`) => `void`

Defined in: [src/ui/runtime/UiTemplate.ts:187](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L187)

Recebe `onpress="acao"` dos botões.

#### Parameters

##### action

`string`

##### button

[`UiButton`](../classes/UiButton.md)

#### Returns

`void`
