[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererUiBackend

# Class: RendererUiBackend

Defined in: [src/ui/runtime/RendererUiBackend.ts:97](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L97)

## Implements

- [`UiBackend`](../interfaces/UiBackend.md)

## Constructors

### Constructor

> **new RendererUiBackend**(`target`): `RendererUiBackend`

Defined in: [src/ui/runtime/RendererUiBackend.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L116)

#### Parameters

##### target

[`UiRenderTarget`](../interfaces/UiRenderTarget.md)

#### Returns

`RendererUiBackend`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:178](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L178)

Remove tudo (troca de cena/shutdown).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`dispose`](../interfaces/UiBackend.md#dispose)

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L143)

Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`render`](../interfaces/UiBackend.md#render)

***

### sync()

> **sync**(`widgets`, `viewport`): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L120)

Sincroniza visuais com a lista de widgets (cria/atualiza/remove).

#### Parameters

##### widgets

readonly [`UiWidget`](UiWidget.md)[]

##### viewport

[`UiViewport`](../interfaces/UiViewport.md)

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`sync`](../interfaces/UiBackend.md#sync)
