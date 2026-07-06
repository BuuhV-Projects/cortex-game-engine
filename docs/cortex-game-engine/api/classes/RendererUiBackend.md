[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererUiBackend

# Class: RendererUiBackend

Defined in: src/ui/runtime/RendererUiBackend.ts:42

## Implements

- [`UiBackend`](../interfaces/UiBackend.md)

## Constructors

### Constructor

> **new RendererUiBackend**(`target`): `RendererUiBackend`

Defined in: src/ui/runtime/RendererUiBackend.ts:56

#### Parameters

##### target

[`UiRenderTarget`](../interfaces/UiRenderTarget.md)

#### Returns

`RendererUiBackend`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: src/ui/runtime/RendererUiBackend.ts:98

Remove tudo (troca de cena/shutdown).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`dispose`](../interfaces/UiBackend.md#dispose)

***

### render()

> **render**(): `void`

Defined in: src/ui/runtime/RendererUiBackend.ts:83

Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`render`](../interfaces/UiBackend.md#render)

***

### sync()

> **sync**(`widgets`, `viewport`): `void`

Defined in: src/ui/runtime/RendererUiBackend.ts:60

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
