[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiLayer

# Class: UiLayer

Defined in: [src/ui/runtime/UiLayer.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L25)

## Constructors

### Constructor

> **new UiLayer**(`backend`, `viewportOf`): `UiLayer`

Defined in: [src/ui/runtime/UiLayer.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L36)

#### Parameters

##### backend

[`UiBackend`](../interfaces/UiBackend.md)

##### viewportOf

() => [`UiViewport`](../interfaces/UiViewport.md)

#### Returns

`UiLayer`

## Accessors

### focused

#### Get Signature

> **get** **focused**(): [`UiButton`](UiButton.md) \| `null`

Defined in: [src/ui/runtime/UiLayer.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L71)

Widget focado no momento (ou null).

##### Returns

[`UiButton`](UiButton.md) \| `null`

## Methods

### activate()

> **activate**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:147](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L147)

Ativa o botão focado (Enter/A).

#### Returns

`void`

***

### add()

> **add**\<`T`\>(`widget`): `T`

Defined in: [src/ui/runtime/UiLayer.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L45)

Adiciona um widget (devolve ele mesmo, pra guardar a referência).

#### Type Parameters

##### T

`T` *extends* [`UiWidget`](UiWidget.md)

#### Parameters

##### widget

`T`

#### Returns

`T`

***

### clear()

> **clear**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L59)

Remove todos os widgets (troca de tela).

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:152](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L152)

Desmonta a camada (listeners + visuais).

#### Returns

`void`

***

### focus()

> **focus**(`button`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L77)

Foca um botão específico (ex.: primeiro item do menu).

#### Parameters

##### button

[`UiButton`](UiButton.md) \| `null`

#### Returns

`void`

***

### navigate()

> **navigate**(`dx`, `dy`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L117)

Move o foco na direção dada (navegação espacial).

#### Parameters

##### dx

`number`

##### dy

`number`

#### Returns

`void`

***

### remove()

> **remove**(`widget`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L52)

Remove um widget.

#### Parameters

##### widget

[`UiWidget`](UiWidget.md)

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L112)

Desenha (backend renderer; no DOM é no-op). Chamado pelo `Game`.

#### Returns

`void`

***

### update()

> **update**(`_dt`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L85)

Por frame: consome teclado (setas/Enter) e gamepad (d-pad/A) pra navegar
e ativar; depois sincroniza o backend. Chamado pelo `Game`.

#### Parameters

##### \_dt

`number`

#### Returns

`void`

***

### viewport()

> **viewport**(): [`UiViewport`](../interfaces/UiViewport.md)

Defined in: [src/ui/runtime/UiLayer.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L66)

Viewport atual da UI (px do canvas) — usado por layouts de template.

#### Returns

[`UiViewport`](../interfaces/UiViewport.md)
