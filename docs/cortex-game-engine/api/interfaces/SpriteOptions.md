[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SpriteOptions

# Interface: SpriteOptions

Defined in: src/scene/Sprite.ts:25

Opções de [createSprite](../functions/createSprite.md).

## Properties

### alphaTest?

> `optional` **alphaTest?**: `number`

Defined in: src/scene/Sprite.ts:35

Recorte por alpha (0 = sem corte; 0.5 bom pra borda dura). Default `0.5`.

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: src/scene/Sprite.ts:37

Tint multiplicado na textura. Default branco.

***

### height?

> `optional` **height?**: `number`

Defined in: src/scene/Sprite.ts:29

Altura em unidades de mundo. Default: `texturaPx.height / pixelsPerUnit`.

***

### pixelated?

> `optional` **pixelated?**: `boolean`

Defined in: src/scene/Sprite.ts:33

Aplica nearest filter (pixel art). Default `true`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: src/scene/Sprite.ts:31

Px por unidade pra dimensionar a partir do tamanho da textura. Default `100`.

***

### width?

> `optional` **width?**: `number`

Defined in: src/scene/Sprite.ts:27

Largura em **unidades de mundo**. Default: `texturaPx.width / pixelsPerUnit`.
