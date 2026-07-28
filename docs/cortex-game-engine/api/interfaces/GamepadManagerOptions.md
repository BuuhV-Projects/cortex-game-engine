[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GamepadManagerOptions

# Interface: GamepadManagerOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L55)

## Properties

### deadzone?

> `optional` **deadzone?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L61)

Magnitude mínima do eixo para que o valor seja reportado por
`getAxis()`. Valores abaixo do limiar viram 0.

#### Default

```ts
0.15
```
