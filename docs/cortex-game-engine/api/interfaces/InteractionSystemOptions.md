[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InteractionSystemOptions

# Interface: InteractionSystemOptions

Defined in: [src/systems/InteractionSystem.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L9)

Opções do [InteractionSystem](../classes/InteractionSystem.md).

## Properties

### button?

> `optional` **button?**: `number`

Defined in: [src/systems/InteractionSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L18)

Botão do gamepad pra interagir. Default `0` (A).

***

### interactor

> **interactor**: () => \{ `x`: `number`; `z`: `number`; \} \| `null`

Defined in: [src/systems/InteractionSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L14)

Posição (XZ) do **interator ativo** — quem interage: player a pé OU carro, o que
estiver no controle no momento. O jogo fornece (devolve `null` = ninguém interage).

#### Returns

\{ `x`: `number`; `z`: `number`; \} \| `null`

***

### key?

> `optional` **key?**: `string`

Defined in: [src/systems/InteractionSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L20)

Tecla pra interagir. Default `e`.

***

### onPrompt?

> `optional` **onPrompt?**: (`interaction`) => `void`

Defined in: [src/systems/InteractionSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L16)

Mostra/esconde o prompt na HUD; `null` = nada em alcance. O jogo renderiza.

#### Parameters

##### interaction

[`InteractionComponent`](../classes/InteractionComponent.md) \| `null`

#### Returns

`void`

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/InteractionSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L22)

Pausa (ex.: `() => game.editorActive`).

#### Returns

`boolean`
