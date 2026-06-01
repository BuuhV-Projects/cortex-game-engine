[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Renderer

# Class: Renderer

Defined in: [src/core/Renderer.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L81)

## Constructors

### Constructor

> **new Renderer**(`__namedParameters`): `Renderer`

Defined in: [src/core/Renderer.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L98)

Cria o renderer, dispara o init assíncrono do backend em background e
registra o listener de redimensionamento automático quando em browser.

#### Parameters

##### \_\_namedParameters

[`RendererOptions`](../interfaces/RendererOptions.md)

#### Returns

`Renderer`

## Accessors

### domElement

#### Get Signature

> **get** **domElement**(): `HTMLCanvasElement`

Defined in: [src/core/Renderer.ts:249](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L249)

Elemento `<canvas>` onde o renderer desenha.

##### Returns

`HTMLCanvasElement`

***

### height

#### Get Signature

> **get** **height**(): `number`

Defined in: [src/core/Renderer.ts:244](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L244)

Altura atual do canvas em pixels.

##### Returns

`number`

***

### isReady

#### Get Signature

> **get** **isReady**(): `boolean`

Defined in: [src/core/Renderer.ts:164](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L164)

`true` quando o backend está pronto e `render()` efetivamente desenha.

##### Returns

`boolean`

***

### threeRenderer

#### Get Signature

> **get** **threeRenderer**(): `WebGPURenderer`

Defined in: [src/core/Renderer.ts:259](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L259)

Instância interna do `WebGPURenderer`.
Exposta para casos avançados: pós-processamento (passar pra `PostProcessing`
de `three/webgpu`) e geração de environment maps. Prefira os métodos
públicos da classe sempre que possível.

##### Returns

`WebGPURenderer`

***

### width

#### Get Signature

> **get** **width**(): `number`

Defined in: [src/core/Renderer.ts:239](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L239)

Largura atual do canvas em pixels.

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [src/core/Renderer.ts:188](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L188)

Limpa o canvas inteiro (color, depth e stencil buffers). No-op antes do init.

Deve ser chamado uma vez por frame **antes do primeiro `renderViewport()`**
quando se usa split-screen.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/core/Renderer.ts:229](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L229)

Remove o listener de resize e libera os recursos GPU do renderer.
Deve ser chamado ao destruir a cena para evitar vazamentos de memória.

#### Returns

`void`

***

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [src/core/Renderer.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L159)

Promessa resolvida quando o backend terminou de inicializar. Opcional —
`render()` já pula frames até estar pronto. Útil pra aguardar antes de
esconder uma tela de loading.

#### Returns

`Promise`\<`void`\>

***

### render()

> **render**(`scene`, `camera`): `void`

Defined in: [src/core/Renderer.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L176)

Renderiza a `scene` usando a `camera` fornecida.
Deve ser chamado a cada frame pelo `GameLoop`. No-op enquanto o backend
ainda não inicializou.

Limpa o canvas antes de renderizar — mantém o comportamento "1 câmera
por frame". Para split-screen, use `clear()` + `renderViewport()`.

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

#### Returns

`void`

***

### renderViewport()

> **renderViewport**(`scene`, `camera`, `viewport`): `void`

Defined in: [src/core/Renderer.ts:204](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L204)

Renderiza `scene` com `camera` em uma região retangular do canvas
(sem limpar — use `clear()` antes do primeiro chamado do frame). No-op
antes do init.

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

##### viewport

[`Viewport`](../interfaces/Viewport.md)

#### Returns

`void`

#### Example

```ts
// Split-screen horizontal de 2 jogadores:
renderer.clear();
renderer.renderViewport(scene, p1Camera, { x: 0,     y: 0, width: w / 2, height: h });
renderer.renderViewport(scene, p2Camera, { x: w / 2, y: 0, width: w / 2, height: h });
```

***

### resize()

> **resize**(`width`, `height`): `void`

Defined in: [src/core/Renderer.ts:219](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L219)

Redimensiona o canvas e o viewport do renderer.
Chamado automaticamente pelo listener de `window.resize`; também pode ser
chamado manualmente quando o canvas não ocupa a janela inteira.

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`void`
