[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueUI

# Interface: DialogueUI

Defined in: src/dialogue/DialogueUI.ts:10

UI de diálogo em **DOM overlay** (ADR-0070) — primeira UI de runtime do engine,
no mesmo padrão de `createDomLoadingScreen` (DOM sobre o canvas, não quads no
Three). Production-safe (vai pro bundle de runtime). É **fina e burra**: só
desenha a [DialogueView](DialogueView.md) e avisa quando o jogador escolhe/avança — toda a
lógica está no [DialogueRunner](../classes/DialogueRunner.md).

## Methods

### advanceLine()

> **advanceLine**(): `void`

Defined in: src/dialogue/DialogueUI.ts:18

Avança a linha simples atual via teclado (chamado pelo glue).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: src/dialogue/DialogueUI.ts:16

Remove a UI do DOM.

#### Returns

`void`

***

### hide()

> **hide**(): `void`

Defined in: src/dialogue/DialogueUI.ts:14

Esconde a caixa.

#### Returns

`void`

***

### render()

> **render**(`view`): `void`

Defined in: src/dialogue/DialogueUI.ts:12

Desenha a view (fala + escolhas) e mostra a caixa.

#### Parameters

##### view

[`DialogueView`](DialogueView.md)

#### Returns

`void`
