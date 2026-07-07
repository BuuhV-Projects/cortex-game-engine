[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DomUiBackend

# Class: DomUiBackend

Defined in: [src/ui/runtime/DomUiBackend.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/DomUiBackend.ts#L21)

## Implements

- [`UiBackend`](../interfaces/UiBackend.md)

## Constructors

### Constructor

> **new DomUiBackend**(`container?`): `DomUiBackend`

Defined in: [src/ui/runtime/DomUiBackend.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/DomUiBackend.ts#L26)

#### Parameters

##### container?

`HTMLElement`

#### Returns

`DomUiBackend`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/DomUiBackend.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/DomUiBackend.ts#L66)

Remove tudo (troca de cena/shutdown).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`dispose`](../interfaces/UiBackend.md#dispose)

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/DomUiBackend.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/DomUiBackend.ts#L62)

Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho).

#### Returns

`void`

#### Implementation of

[`UiBackend`](../interfaces/UiBackend.md).[`render`](../interfaces/UiBackend.md#render)

***

### sync()

> **sync**(`widgets`, `viewport`): `void`

Defined in: [src/ui/runtime/DomUiBackend.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/DomUiBackend.ts#L34)

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
