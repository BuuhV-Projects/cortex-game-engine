[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / pickRenderCamera

# Function: pickRenderCamera()

> **pickRenderCamera**(`editor`, `gameCamera`): `PerspectiveCamera` \| `OrthographicCamera`

Defined in: [src/core/Game.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L84)

Câmera que está desenhando a cena (SPEC-0303): a livre do editor quando ele está
ativo (F2), senão a do jogo. Puro — base de [Game.renderCamera](../classes/Game.md#rendercamera).

## Parameters

### editor

`Pick`\<[`GameEditor`](../interfaces/GameEditor.md), `"activeCamera"`\> \| `null`

### gameCamera

`PerspectiveCamera` \| `OrthographicCamera`

## Returns

`PerspectiveCamera` \| `OrthographicCamera`
