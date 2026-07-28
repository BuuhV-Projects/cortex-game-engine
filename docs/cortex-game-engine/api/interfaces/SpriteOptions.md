[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SpriteOptions

# Interface: SpriteOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L25)

Opções de [createSprite](../functions/createSprite.md).

## Properties

### alphaTest?

> `optional` **alphaTest?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L35)

Recorte por alpha (0 = sem corte; 0.5 bom pra borda dura). Default `0.5`.

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L37)

Tint multiplicado na textura. Default branco.

***

### height?

> `optional` **height?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L29)

Altura em unidades de mundo. Default: `texturaPx.height / pixelsPerUnit`.

***

### pixelated?

> `optional` **pixelated?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L33)

Aplica nearest filter (pixel art). Default `true`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L31)

Px por unidade pra dimensionar a partir do tamanho da textura. Default `100`.

***

### width?

> `optional` **width?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Sprite.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L27)

Largura em **unidades de mundo**. Default: `texturaPx.width / pixelsPerUnit`.
