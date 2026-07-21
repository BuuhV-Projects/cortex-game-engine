[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CellStreamingOptions

# Interface: CellStreamingOptions

Defined in: src/scene/Streaming.ts:35

Opções do [CellStreamingSystem](../classes/CellStreamingSystem.md).

## Properties

### budgetPerFrame?

> `optional` **budgetPerFrame?**: `number`

Defined in: src/scene/Streaming.ts:44

Máx. de células carregadas POR FRAME (espalha o custo). Default `1`.

***

### getCameraXZ

> **getCameraXZ**: () => [`Vec2XZ`](Vec2XZ.md)

Defined in: src/scene/Streaming.ts:46

Posição XZ da câmera/jogador a cada tick.

#### Returns

[`Vec2XZ`](Vec2XZ.md)

***

### hysteresis?

> `optional` **hysteresis?**: `number`

Defined in: src/scene/Streaming.ts:42

Folga de descarga (m): só descarrega além de `radius + hysteresis`. Evita
carregar/descarregar em loop quando a câmera fica na borda. Default `radius/4`.

***

### onLoad

> **onLoad**: (`key`) => `void`

Defined in: src/scene/Streaming.ts:48

Monta a célula (o app faz buildScene dos nós dela).

#### Parameters

##### key

`string`

#### Returns

`void`

***

### onUnload

> **onUnload**: (`key`) => `void`

Defined in: src/scene/Streaming.ts:50

Descarta a célula (o app remove/libera a GPU).

#### Parameters

##### key

`string`

#### Returns

`void`

***

### radius

> **radius**: `number`

Defined in: src/scene/Streaming.ts:37

Raio de carga (m): células com centro dentro dele viram residentes.
