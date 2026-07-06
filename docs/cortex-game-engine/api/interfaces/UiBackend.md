[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiBackend

# Interface: UiBackend

Defined in: src/ui/runtime/UiBackend.ts:11

## Methods

### dispose()

> **dispose**(): `void`

Defined in: src/ui/runtime/UiBackend.ts:17

Remove tudo (troca de cena/shutdown).

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: src/ui/runtime/UiBackend.ts:15

Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho).

#### Returns

`void`

***

### sync()

> **sync**(`widgets`, `viewport`): `void`

Defined in: src/ui/runtime/UiBackend.ts:13

Sincroniza visuais com a lista de widgets (cria/atualiza/remove).

#### Parameters

##### widgets

readonly [`UiWidget`](../classes/UiWidget.md)[]

##### viewport

[`UiViewport`](UiViewport.md)

#### Returns

`void`
