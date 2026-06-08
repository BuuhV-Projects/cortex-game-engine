[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayMatte

# Function: overlayMatte()

> **overlayMatte**(`overlay`): `Record`\<`string`, `boolean`\>

Defined in: [src/scene/SceneBuilder.ts:160](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L160)

Lê `data.matte` da overlay — o estado fosco/cartoon **autorado no editor** por
nome de objeto (`{ [nome]: boolean }`). `true` = fosco; `false` = sobrescreve um
`matte` definido no código/nó pra NÃO-fosco. Ausência = sem opinião (cai pro nó/
global). Ver [setMatte](setMatte.md).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, `boolean`\>
