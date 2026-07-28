[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiRenderTarget

# Interface: UiRenderTarget

Defined in: [src/ui/runtime/RendererUiBackend.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L24)

Só o que precisamos do Renderer do engine (evita acoplamento).

## Methods

### renderUiLayer()?

> `optional` **renderUiLayer**(`scene`, `camera`, `width`, `height`): `unknown`

Defined in: [src/ui/runtime/RendererUiBackend.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L35)

Caminho de composição em gama (ADR-0105): renderiza a UI numa RenderTarget
própria (linear) e devolve o GPUTexture do backend pro host compor sobre o
jogo. Opcional (mock de teste / hosts antigos não têm).

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

##### width

`number`

##### height

`number`

#### Returns

`unknown`

***

### renderViewport()

> **renderViewport**(`scene`, `camera`, `viewport`): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L25)

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

##### viewport

###### height

`number`

###### width

`number`

###### x

`number`

###### y

`number`

#### Returns

`void`
