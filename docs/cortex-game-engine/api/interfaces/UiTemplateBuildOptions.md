[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplateBuildOptions

# Interface: UiTemplateBuildOptions

Defined in: [src/ui/runtime/UiTemplate.ts:175](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L175)

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: [src/ui/runtime/UiTemplate.ts:177](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L177)

Valores pra `{{chave}}` nos textos.

***

### onAction?

> `optional` **onAction?**: (`action`, `button`) => `void`

Defined in: [src/ui/runtime/UiTemplate.ts:179](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L179)

Recebe `onpress="acao"` dos botões.

#### Parameters

##### action

`string`

##### button

[`UiButton`](../classes/UiButton.md)

#### Returns

`void`
