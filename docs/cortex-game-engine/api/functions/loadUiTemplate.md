[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadUiTemplate

# Function: loadUiTemplate()

> **loadUiTemplate**(`ui`, `url`, `options?`): `Promise`\<[`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)\>

Defined in: [src/ui/runtime/UiTemplate.ts:260](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiTemplate.ts#L260)

Carrega um template `.html` DINAMICAMENTE (fetch — funciona no browser e
no host, que lê do pacote do jogo) e o instancia na camada.

## Parameters

### ui

[`UiLayer`](../classes/UiLayer.md)

### url

`string`

### options?

[`UiTemplateBuildOptions`](../interfaces/UiTemplateBuildOptions.md) = `{}`

## Returns

`Promise`\<[`UiTemplateInstance`](../interfaces/UiTemplateInstance.md)\>
