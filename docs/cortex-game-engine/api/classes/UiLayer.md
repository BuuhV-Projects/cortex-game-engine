[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiLayer

# Class: UiLayer

Defined in: [src/ui/runtime/UiLayer.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L32)

## Constructors

### Constructor

> **new UiLayer**(`backend`, `viewportOf`): `UiLayer`

Defined in: [src/ui/runtime/UiLayer.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L68)

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

Defined in: [src/ui/runtime/UiLayer.ts:123](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L123)

Widget focado no momento (ou null).

##### Returns

[`UiButton`](UiButton.md) \| `null`

## Methods

### activate()

> **activate**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:201](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L201)

Ativa o botão focado (Enter/A).

#### Returns

`void`

***

### add()

> **add**\<`T`\>(`widget`): `T`

Defined in: [src/ui/runtime/UiLayer.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L84)

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

Defined in: [src/ui/runtime/UiLayer.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L98)

Remove todos os widgets (troca de tela).

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:206](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L206)

Desmonta a camada (listeners + visuais).

#### Returns

`void`

***

### focus()

> **focus**(`button`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L129)

Foca um botão específico (ex.: primeiro item do menu).

#### Parameters

##### button

[`UiButton`](UiButton.md) \| `null`

#### Returns

`void`

***

### navigate()

> **navigate**(`dx`, `dy`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:171](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L171)

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

Defined in: [src/ui/runtime/UiLayer.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L91)

Remove um widget.

#### Parameters

##### widget

[`UiWidget`](UiWidget.md)

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:166](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L166)

Desenha (backend renderer; no DOM é no-op). Chamado pelo `Game`.

#### Returns

`void`

***

### update()

> **update**(`_dt`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:137](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L137)

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

Defined in: [src/ui/runtime/UiLayer.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L110)

Viewport de DESIGN da UI (px lógicos, espaço onde os widgets são posicionados)
— usado por layouts de template. É o viewport real dividido pela [uiScale](../functions/uiScale.md),
então o layout é o MESMO em qualquer resolução; o backend estica pro real
(ADR-0129).

#### Returns

[`UiViewport`](../interfaces/UiViewport.md)
