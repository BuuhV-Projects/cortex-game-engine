[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiBackend

# Interface: UiBackend

Defined in: [src/ui/runtime/UiBackend.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiBackend.ts#L11)

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/UiBackend.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiBackend.ts#L23)

Remove tudo (troca de cena/shutdown).

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/UiBackend.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiBackend.ts#L21)

Desenha o frame de UI (no DOM é no-op — o browser pinta sozinho).

#### Returns

`void`

***

### sync()

> **sync**(`widgets`, `viewport`, `scale?`): `void`

Defined in: [src/ui/runtime/UiBackend.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiBackend.ts#L19)

Sincroniza visuais com a lista de widgets (cria/atualiza/remove). O
`viewport` é o de DESIGN (espaço lógico do layout, ver `layout.ts`); o
backend PRESENTA esse espaço esticado pra tela real pelo `scale` (DOM: uma
`transform: scale` na raiz; renderer: câmera no espaço de design + região de
render no viewport real). `scale` default 1 = sem escala (ADR-0129).

#### Parameters

##### widgets

readonly [`UiWidget`](../classes/UiWidget.md)[]

##### viewport

[`UiViewport`](UiViewport.md)

##### scale?

`number`

#### Returns

`void`
