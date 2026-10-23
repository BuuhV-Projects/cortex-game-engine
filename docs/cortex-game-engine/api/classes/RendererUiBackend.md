[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererUiBackend

# Class: RendererUiBackend

Defined in: [src/ui/runtime/RendererUiBackend.ts:151](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L151)

## Implements

- [`UiBackend`](../interfaces/UiBackend.md)

## Constructors

### Constructor

> **new RendererUiBackend**(`target`): `RendererUiBackend`

Defined in: [src/ui/runtime/RendererUiBackend.ts:184](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L184)

#### Parameters

##### target

[`UiRenderTarget`](../interfaces/UiRenderTarget.md)

#### Returns

`RendererUiBackend`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:249](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L249)

Remove tudo (troca de cena/shutdown).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`dispose`](../interfaces/UiBackend.md#dispose)

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:214](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L214)

Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`render`](../interfaces/UiBackend.md#render)

***

### sync()

> **sync**(`widgets`, `viewport`, `scale?`): `void`

Defined in: [src/ui/runtime/RendererUiBackend.ts:188](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/RendererUiBackend.ts#L188)

Sincroniza visuais com a lista de widgets (cria/atualiza/remove). O
`viewport` é o de DESIGN (espaço lógico do layout, ver `layout.ts`); o
backend PRESENTA esse espaço esticado pra tela real pelo `scale` (DOM: uma
`transform: scale` na raiz; renderer: câmera no espaço de design + região de
render no viewport real). `scale` default 1 = sem escala (SPEC-0129).

#### Parameters

##### widgets

readonly [`UiWidget`](UiWidget.md)[]

##### viewport

[`UiViewport`](../interfaces/UiViewport.md)

##### scale?

`number` = `1`

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`sync`](../interfaces/UiBackend.md#sync)
