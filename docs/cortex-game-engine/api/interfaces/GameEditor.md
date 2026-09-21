[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameEditor

# Interface: GameEditor

Defined in: [src/core/Game.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L48)

Handle do editor injetado no [Game](../classes/Game.md) (só existe no bundle de
desenvolvimento — ver [registerEditorAttacher](../functions/registerEditorAttacher.md)). O Game pergunta a câmera
ativa a cada frame (editor de voo livre quando ligado, senão `null`) e dá um
`update(dt)` pra a reatividade da UI do editor.

## Methods

### activeCamera()

> **activeCamera**(): `PerspectiveCamera` \| `null`

Defined in: [src/core/Game.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L50)

Câmera a usar no render (a livre do editor quando ativo; `null` = usar a do jogo).

#### Returns

`PerspectiveCamera` \| `null`

***

### isActive()

> **isActive**(): `boolean`

Defined in: [src/core/Game.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L54)

`true` quando o editor (F2) está ativo — pra pausar a gameplay.

#### Returns

`boolean`

***

### isPaused()

> **isPaused**(): `boolean`

Defined in: [src/core/Game.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L56)

`true` quando a gameplay está PAUSADA durante o play (Unity-style pause).

#### Returns

`boolean`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/core/Game.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L52)

Chamado a cada frame, depois do `world.tick`, pra reatividade dos painéis.

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
