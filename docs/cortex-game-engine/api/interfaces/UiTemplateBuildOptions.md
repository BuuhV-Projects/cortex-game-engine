[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiTemplateBuildOptions

# Interface: UiTemplateBuildOptions

Defined in: [src/ui/runtime/UiTemplate.ts:206](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L206)

## Properties

### data?

> `optional` **data?**: `Record`\<`string`, `string` \| `number`\>

Defined in: [src/ui/runtime/UiTemplate.ts:208](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L208)

Valores pra `{{chave}}` nos textos.

***

### onAction?

> `optional` **onAction?**: (`action`, `button`) => `void`

Defined in: [src/ui/runtime/UiTemplate.ts:210](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L210)

Recebe `onpress="acao"` dos botões.

#### Parameters

##### action

`string`

##### button

[`UiButton`](../classes/UiButton.md)

#### Returns

`void`
