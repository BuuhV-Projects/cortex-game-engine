[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplateBuildOptions

# Interface: UiTemplateBuildOptions

Defined in: [src/ui/runtime/UiTemplate.ts:213](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L213)

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: [src/ui/runtime/UiTemplate.ts:215](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L215)

Valores pra `{{chave}}` nos textos.

***

### onAction?

> `optional` **onAction?**: (`action`, `button`) => `void`

Defined in: [src/ui/runtime/UiTemplate.ts:217](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L217)

Recebe `onpress="acao"` dos botões.

#### Parameters

##### action

`string`

##### button

[`UiButton`](../classes/UiButton.md)

#### Returns

`void`
