[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SpriteAnim

# Interface: SpriteAnim

Defined in: [src/components/SpriteAnimationComponent.ts:6](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L6)

Uma animação: sequência de frames (índices na spritesheet) + cadência.

## Properties

### fps?

> `optional` **fps?**: `number`

Defined in: [src/components/SpriteAnimationComponent.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L10)

Frames por segundo. Default `10`.

***

### frames

> **frames**: `number`[]

Defined in: [src/components/SpriteAnimationComponent.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L8)

Frames (índices na spritesheet), na ordem de exibição.

***

### loop?

> `optional` **loop?**: `boolean`

Defined in: [src/components/SpriteAnimationComponent.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L12)

Repete em loop? Default `true` (false = trava no último frame).
