[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiRenderTarget

# Interface: UiRenderTarget

Defined in: [src/ui/runtime/RendererUiBackend.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L23)

Só o que precisamos do Renderer do engine (evita acoplamento).

## Methods

### renderViewport()

> **renderViewport**(`scene`, `camera`, `viewport`, `opts?`): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L24)

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

##### opts?

`noToneMapping`: a UI é cor de interface (sRGB), NÃO cena — não pode
passar pelo ACES do jogo (que esfria/lava os tons). Ver Renderer.

###### noToneMapping?

`boolean`

#### Returns

`void`
