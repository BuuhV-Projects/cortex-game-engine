[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InteractionOptions

# Interface: InteractionOptions

Defined in: src/components/InteractionComponent.ts:4

Opções do [InteractionComponent](../classes/InteractionComponent.md).

## Properties

### onInteract?

> `optional` **onInteract?**: () => `void`

Defined in: src/components/InteractionComponent.ts:10

Callback disparado ao interagir (botão A / tecla E). A lógica é do jogo.

#### Returns

`void`

***

### prompt?

> `optional` **prompt?**: `string`

Defined in: src/components/InteractionComponent.ts:6

Texto do prompt mostrado ao chegar perto (ex.: "Entrar", "Falar"). Default `Interagir`.

***

### range?

> `optional` **range?**: `number`

Defined in: src/components/InteractionComponent.ts:8

Alcance (raio XZ) pra ativar a interação. Default `2.5`.
