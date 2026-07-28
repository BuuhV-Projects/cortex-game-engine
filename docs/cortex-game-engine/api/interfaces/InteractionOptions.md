[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InteractionOptions

# Interface: InteractionOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/components/InteractionComponent.ts:4](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/InteractionComponent.ts#L4)

Opções do [InteractionComponent](../classes/InteractionComponent.md).

## Properties

### onInteract?

> `optional` **onInteract?**: () => `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/InteractionComponent.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/InteractionComponent.ts#L10)

Callback disparado ao interagir (botão A / tecla E). A lógica é do jogo.

#### Returns

`void`

***

### prompt?

> `optional` **prompt?**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/InteractionComponent.ts:6](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/InteractionComponent.ts#L6)

Texto do prompt mostrado ao chegar perto (ex.: "Entrar", "Falar"). Default `Interagir`.

***

### range?

> `optional` **range?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/InteractionComponent.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/InteractionComponent.ts#L8)

Alcance (raio XZ) pra ativar a interação. Default `2.5`.
