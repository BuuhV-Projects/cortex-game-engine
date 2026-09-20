[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiLayer

# Class: UiLayer

Defined in: [src/ui/runtime/UiLayer.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L58)

## Constructors

### Constructor

> **new UiLayer**(`backend`, `viewportOf`): `UiLayer`

Defined in: [src/ui/runtime/UiLayer.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L104)

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

Defined in: [src/ui/runtime/UiLayer.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L159)

Widget focado no momento (ou null).

##### Returns

[`UiButton`](UiButton.md) \| `null`

***

### inputEnabled

#### Get Signature

> **get** **inputEnabled**(): `boolean`

Defined in: [src/ui/runtime/UiLayer.ts:191](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L191)

A navegação por teclado/gamepad está ativa?

##### Returns

`boolean`

## Methods

### activate()

> **activate**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:272](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L272)

Ativa o botão focado (Enter/A).

#### Returns

`void`

***

### add()

> **add**\<`T`\>(`widget`): `T`

Defined in: [src/ui/runtime/UiLayer.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L120)

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

Defined in: [src/ui/runtime/UiLayer.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L134)

Remove todos os widgets (troca de tela).

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:277](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L277)

Desmonta a camada (listeners + visuais).

#### Returns

`void`

***

### focus()

> **focus**(`button`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:165](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L165)

Foca um botão específico (ex.: primeiro item do menu).

#### Parameters

##### button

[`UiButton`](UiButton.md) \| `null`

#### Returns

`void`

***

### navigate()

> **navigate**(`dx`, `dy`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:242](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L242)

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

Defined in: [src/ui/runtime/UiLayer.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L127)

Remove um widget.

#### Parameters

##### widget

[`UiWidget`](UiWidget.md)

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [src/ui/runtime/UiLayer.ts:237](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L237)

Desenha (backend renderer; no DOM é no-op). Chamado pelo `Game`.

#### Returns

`void`

***

### setInputEnabled()

> **setInputEnabled**(`enabled`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:185](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L185)

Suspende (ou retoma) a navegação por teclado/gamepad. A tela de Controles
desliga enquanto espera o jogador pressionar a tecla a mapear.

#### Parameters

##### enabled

`boolean`

#### Returns

`void`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:199](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L199)

Por frame: consome teclado (setas/Enter) e gamepad (d-pad/A) pra navegar
e ativar; depois sincroniza o backend. Chamado pelo `Game`.

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`

***

### useActions()

> **useActions**(`actions`): `void`

Defined in: [src/ui/runtime/UiLayer.ts:177](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L177)

Liga a navegação dos menus ao mapa de ações remapeáveis (ADR-0164): d-pad,
A e B passam a seguir `uiUp`/`uiDown`/`uiLeft`/`uiRight`/`uiConfirm`. Sem
isso, a navegação usa os índices fixos do layout standard — e um controle
genérico com outra ordem não navega o menu nem depois de remapeado.

#### Parameters

##### actions

`UiActionReader` \| `null`

Mapa de ações (tipicamente `game.actions`), ou `null` pra voltar ao padrão.

#### Returns

`void`

***

### viewport()

> **viewport**(): [`UiViewport`](../interfaces/UiViewport.md)

Defined in: [src/ui/runtime/UiLayer.ts:146](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L146)

Viewport de DESIGN da UI (px lógicos, espaço onde os widgets são posicionados)
— usado por layouts de template. É o viewport real dividido pela [uiScale](../functions/uiScale.md),
então o layout é o MESMO em qualquer resolução; o backend estica pro real
(SPEC-0129).

#### Returns

[`UiViewport`](../interfaces/UiViewport.md)
