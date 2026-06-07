[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createSprite

# Function: createSprite()

> **createSprite**(`texture`, `options?`): `Mesh`

Defined in: [src/scene/Sprite.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Sprite.ts#L56)

Cria um **sprite 2D**: um quad (`PlaneGeometry`) no plano XY com a textura como
material **unlit** (`MeshBasicMaterial`, sem iluminação/tonemap), transparente e
com **nearest filter** (pixel nítido). Encaixa numa entidade ECS via
`Object3DComponent` igual qualquer mesh; combine com `Game({ projection:
'orthographic' })` pra um jogo pixel.

O tamanho vem em unidades de mundo: passe `width`/`height`, ou deixe derivar do
tamanho em px da textura ÷ `pixelsPerUnit`. Ex.: textura 16×16, `pixelsPerUnit:
16` → sprite de 1×1 unidade.

## Parameters

### texture

`Texture`

### options?

[`SpriteOptions`](../interfaces/SpriteOptions.md) = `{}`

## Returns

`Mesh`

## Example

```ts
const tex = await new AssetLoader().loadTexture('hero.png', { pixelated: true })
const hero = createSprite(tex, { pixelsPerUnit: 16 })
game.scene.add(hero)
```
