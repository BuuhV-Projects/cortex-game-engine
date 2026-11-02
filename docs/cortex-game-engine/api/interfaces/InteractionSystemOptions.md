[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InteractionSystemOptions

# Interface: InteractionSystemOptions

Defined in: [src/systems/InteractionSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L10)

Opções do [InteractionSystem](../classes/InteractionSystem.md).

## Properties

### actionId?

> `optional` **actionId?**: `string`

Defined in: [src/systems/InteractionSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L30)

Id da ação usada quando `actions` é passado. Default `interact`.

***

### actions?

> `optional` **actions?**: [`InputActions`](../classes/InputActions.md)

Defined in: [src/systems/InteractionSystem.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L28)

**Ações de input remapeáveis** (ADR-0164) — passe `game.actions` pra usar a
ação `interact` (e o que o jogador remapeou) em vez de `button`/`key`.

***

### button?

> `optional` **button?**: `number`

Defined in: [src/systems/InteractionSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L19)

Botão do gamepad pra interagir. Default `0` (A).

***

### interactor

> **interactor**: () => \{ `x`: `number`; `z`: `number`; \} \| `null`

Defined in: [src/systems/InteractionSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L15)

Posição (XZ) do **interator ativo** — quem interage: player a pé OU carro, o que
estiver no controle no momento. O jogo fornece (devolve `null` = ninguém interage).

#### Returns

\{ `x`: `number`; `z`: `number`; \} \| `null`

***

### key?

> `optional` **key?**: `string`

Defined in: [src/systems/InteractionSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L21)

Tecla pra interagir. Default `e`.

***

### onPrompt?

> `optional` **onPrompt?**: (`interaction`) => `void`

Defined in: [src/systems/InteractionSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L17)

Mostra/esconde o prompt na HUD; `null` = nada em alcance. O jogo renderiza.

#### Parameters

##### interaction

[`InteractionComponent`](../classes/InteractionComponent.md) \| `null`

#### Returns

`void`

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/InteractionSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L23)

Pausa (ex.: `() => game.editorActive`).

#### Returns

`boolean`
