[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameEditor

# Interface: GameEditor

Defined in: [jge-present/src/core/Game.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L56)

Handle do editor injetado no [Game](../classes/Game.md) (só existe no bundle de
desenvolvimento — ver [registerEditorAttacher](../functions/registerEditorAttacher.md)). O Game pergunta a câmera
ativa a cada frame (editor de voo livre quando ligado, senão `null`) e dá um
`update(dt)` pra a reatividade da UI do editor.

## Methods

### activeCamera()

> **activeCamera**(): `PerspectiveCamera` \| `null`

Defined in: [jge-present/src/core/Game.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L58)

Câmera a usar no render (a livre do editor quando ativo; `null` = usar a do jogo).

#### Returns

`PerspectiveCamera` \| `null`

***

### isActive()

> **isActive**(): `boolean`

Defined in: [jge-present/src/core/Game.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L62)

`true` quando o editor (F2) está ativo — pra pausar a gameplay.

#### Returns

`boolean`

***

### isPaused()

> **isPaused**(): `boolean`

Defined in: [jge-present/src/core/Game.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L64)

`true` quando a gameplay está PAUSADA durante o play (Unity-style pause).

#### Returns

`boolean`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [jge-present/src/core/Game.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L60)

Chamado a cada frame, depois do `world.tick`, pra reatividade dos painéis.

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
