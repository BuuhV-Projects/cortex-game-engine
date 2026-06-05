[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameEditor

# Interface: GameEditor

Defined in: [src/core/Game.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L14)

Handle do editor injetado no [Game](../classes/Game.md) (só existe no bundle de
desenvolvimento — ver [registerEditorAttacher](../functions/registerEditorAttacher.md)). O Game pergunta a câmera
ativa a cada frame (editor de voo livre quando ligado, senão `null`) e dá um
`update(dt)` pra a reatividade da UI do editor.

## Methods

### activeCamera()

> **activeCamera**(): `PerspectiveCamera` \| `null`

Defined in: [src/core/Game.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L16)

Câmera a usar no render (a livre do editor quando ativo; `null` = usar a do jogo).

#### Returns

`PerspectiveCamera` \| `null`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/core/Game.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L18)

Chamado a cada frame, depois do `world.tick`, pra reatividade dos painéis.

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
