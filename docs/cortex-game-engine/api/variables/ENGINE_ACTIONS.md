[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ENGINE\_ACTIONS

# Variable: ENGINE\_ACTIONS

> `const` **ENGINE\_ACTIONS**: readonly [`ActionDef`](../interfaces/ActionDef.md)[]

Defined in: [src/input/defaultActions.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/defaultActions.ts#L53)

Ações da engine com os bindings de fábrica. A ordem é a de exibição na tela
de Controles.

## Example

```ts
const actions = new InputActions(game.input, game.gamepad);
if (actions.pressed('jump')) body.jump();
```
