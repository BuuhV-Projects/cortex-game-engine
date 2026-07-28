[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CellStreamingOptions

# Interface: CellStreamingOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L35)

Opções do [CellStreamingSystem](../classes/CellStreamingSystem.md).

## Properties

### budgetPerFrame?

> `optional` **budgetPerFrame?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L44)

Máx. de células carregadas POR FRAME (espalha o custo). Default `1`.

***

### getCameraXZ

> **getCameraXZ**: () => [`Vec2XZ`](Vec2XZ.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L46)

Posição XZ da câmera/jogador a cada tick.

#### Returns

[`Vec2XZ`](Vec2XZ.md)

***

### hysteresis?

> `optional` **hysteresis?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L42)

Folga de descarga (m): só descarrega além de `radius + hysteresis`. Evita
carregar/descarregar em loop quando a câmera fica na borda. Default `radius/4`.

***

### onLoad

> **onLoad**: (`key`) => `void` \| `Promise`\<`unknown`\>

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L55)

Monta a célula (o app faz buildScene dos nós dela). Pode ser **assíncrono**
(carga sob demanda): enquanto a Promise não resolve, a célula conta como
"carregando" ([CellStreamingSystem.loadingCount](../classes/CellStreamingSystem.md#loadingcount)) — o dev usa isso pra
uma tela de loading. O app deve conferir se a célula ainda é desejada
([CellStreamingSystem.isResident](../classes/CellStreamingSystem.md#isresident)) antes de adicioná-la (pode ter saído
do raio durante a carga).

#### Parameters

##### key

`string`

#### Returns

`void` \| `Promise`\<`unknown`\>

***

### onProgress?

> `optional` **onProgress?**: (`loading`, `resident`) => `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L59)

Chamado quando o nº de células carregando muda (pra atualizar a tela de loading).

#### Parameters

##### loading

`number`

##### resident

`number`

#### Returns

`void`

***

### onUnload

> **onUnload**: (`key`) => `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L57)

Descarta a célula (o app remove/libera a GPU).

#### Parameters

##### key

`string`

#### Returns

`void`

***

### radius

> **radius**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Streaming.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L37)

Raio de carga (m): células com centro dentro dele viram residentes.
