[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createAnimatedSprite

# Function: createAnimatedSprite()

> **createAnimatedSprite**(`sheet`, `anims`, `options?`): `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L88)

Cria um **sprite animado**: o mesh (quad do tamanho de UM frame) + o
[SpriteAnimationComponent](../classes/SpriteAnimationComponent.md) pronto pra entrar numa entidade ECS (com
`Object3DComponent(sprite)`). A textura é **clonada** da sheet (pra cada sprite
animar independente). Registre o [SpriteAnimationSystem](../classes/SpriteAnimationSystem.md) no world.

## Parameters

### sheet

[`Spritesheet`](../classes/Spritesheet.md)

### anims

`Record`\<`string`, [`SpriteAnim`](../interfaces/SpriteAnim.md)\>

### options?

[`AnimatedSpriteOptions`](../interfaces/AnimatedSpriteOptions.md) = `{}`

## Returns

`object`

### animation

> **animation**: [`SpriteAnimationComponent`](../classes/SpriteAnimationComponent.md)

### sprite

> **sprite**: `Mesh`

## Example

```ts
const sheet = new Spritesheet(tex, { frameWidth: 16, frameHeight: 16 })
const { sprite, animation } = createAnimatedSprite(sheet, {
  idle: { frames: [0, 1], fps: 4 },
  run: { frames: [2, 3, 4, 5], fps: 12 },
}, { pixelsPerUnit: 16, initial: 'idle' })
game.scene.add(sprite)
const e = game.world.createEntity()
e.addComponent(new Object3DComponent(sprite)); e.addComponent(animation)
```
