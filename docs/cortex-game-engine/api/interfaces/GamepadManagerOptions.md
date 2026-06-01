[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GamepadManagerOptions

# Interface: GamepadManagerOptions

Defined in: [src/core/GamepadManager.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L53)

## Properties

### deadzone?

> `optional` **deadzone?**: `number`

Defined in: [src/core/GamepadManager.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L59)

Magnitude mínima do eixo para que o valor seja reportado por
`getAxis()`. Valores abaixo do limiar viram 0.

#### Default

```ts
0.15
```
