[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SpriteAnim

# Interface: SpriteAnim

Defined in: src/components/SpriteAnimationComponent.ts:6

Uma animação: sequência de frames (índices na spritesheet) + cadência.

## Properties

### fps?

> `optional` **fps?**: `number`

Defined in: src/components/SpriteAnimationComponent.ts:10

Frames por segundo. Default `10`.

***

### frames

> **frames**: `number`[]

Defined in: src/components/SpriteAnimationComponent.ts:8

Frames (índices na spritesheet), na ordem de exibição.

***

### loop?

> `optional` **loop?**: `boolean`

Defined in: src/components/SpriteAnimationComponent.ts:12

Repete em loop? Default `true` (false = trava no último frame).
