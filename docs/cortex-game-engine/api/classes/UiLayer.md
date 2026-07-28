[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiLayer

# Class: UiLayer

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L42)

## Constructors

### Constructor

> **new UiLayer**(`backend`, `viewportOf`): `UiLayer`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L86)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:141](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L141)

Widget focado no momento (ou null).

##### Returns

[`UiButton`](UiButton.md) \| `null`

***

### inputEnabled

#### Get Signature

> **get** **inputEnabled**(): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:173](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L173)

A navegação por teclado/gamepad está ativa?

##### Returns

`boolean`

## Methods

### activate()

> **activate**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:253](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L253)

Ativa o botão focado (Enter/A).

#### Returns

`void`

***

### add()

> **add**\<`T`\>(`widget`): `T`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L102)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L116)

Remove todos os widgets (troca de tela).

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:258](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L258)

Desmonta a camada (listeners + visuais).

#### Returns

`void`

***

### focus()

> **focus**(`button`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:147](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L147)

Foca um botão específico (ex.: primeiro item do menu).

#### Parameters

##### button

[`UiButton`](UiButton.md) \| `null`

#### Returns

`void`

***

### navigate()

> **navigate**(`dx`, `dy`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:223](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L223)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L109)

Remove um widget.

#### Parameters

##### widget

[`UiWidget`](UiWidget.md)

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:218](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L218)

Desenha (backend renderer; no DOM é no-op). Chamado pelo `Game`.

#### Returns

`void`

***

### setInputEnabled()

> **setInputEnabled**(`enabled`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:167](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L167)

Suspende (ou retoma) a navegação por teclado/gamepad. A tela de Controles
desliga enquanto espera o jogador pressionar a tecla a mapear.

#### Parameters

##### enabled

`boolean`

#### Returns

`void`

***

### update()

> **update**(`_dt`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:181](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L181)

Por frame: consome teclado (setas/Enter) e gamepad (d-pad/A) pra navegar
e ativar; depois sincroniza o backend. Chamado pelo `Game`.

#### Parameters

##### \_dt

`number`

#### Returns

`void`

***

### useActions()

> **useActions**(`actions`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L159)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiLayer.ts:128](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiLayer.ts#L128)

Viewport de DESIGN da UI (px lógicos, espaço onde os widgets são posicionados)
— usado por layouts de template. É o viewport real dividido pela [uiScale](../functions/uiScale.md),
então o layout é o MESMO em qualquer resolução; o backend estica pro real
(SPEC-0129).

#### Returns

[`UiViewport`](../interfaces/UiViewport.md)
