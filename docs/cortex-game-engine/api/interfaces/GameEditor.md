[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameEditor

# Interface: GameEditor

Defined in: [.claude/worktrees/boot-cooperativo/src/core/Game.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L39)

Handle do editor injetado no [Game](../classes/Game.md) (só existe no bundle de
desenvolvimento — ver [registerEditorAttacher](../functions/registerEditorAttacher.md)). O Game pergunta a câmera
ativa a cada frame (editor de voo livre quando ligado, senão `null`) e dá um
`update(dt)` pra a reatividade da UI do editor.

## Methods

### activeCamera()

> **activeCamera**(): `PerspectiveCamera` \| `null`

Defined in: [.claude/worktrees/boot-cooperativo/src/core/Game.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L41)

Câmera a usar no render (a livre do editor quando ativo; `null` = usar a do jogo).

#### Returns

`PerspectiveCamera` \| `null`

***

### isActive()

> **isActive**(): `boolean`

Defined in: [.claude/worktrees/boot-cooperativo/src/core/Game.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L45)

`true` quando o editor (F2) está ativo — pra pausar a gameplay.

#### Returns

`boolean`

***

### isPaused()

> **isPaused**(): `boolean`

Defined in: [.claude/worktrees/boot-cooperativo/src/core/Game.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L47)

`true` quando a gameplay está PAUSADA durante o play (Unity-style pause).

#### Returns

`boolean`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [.claude/worktrees/boot-cooperativo/src/core/Game.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L43)

Chamado a cada frame, depois do `world.tick`, pra reatividade dos painéis.

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
