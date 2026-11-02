[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseSceneFile

# Function: parseSceneFile()

> **parseSceneFile**(`raw`): [`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null`

Defined in: [src/scene/SceneFile.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneFile.ts#L46)

Valida e parseia um objeto desconhecido (ex.: JSON.parse de um fetch) num
`SceneFileV1`. Retorna `null` se o formato for inválido — o chamador faz
fallback para os defaults do código.

## Parameters

### raw

`unknown`

## Returns

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null`
