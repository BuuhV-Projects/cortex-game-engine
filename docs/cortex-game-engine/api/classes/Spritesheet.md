[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Spritesheet

# Class: Spritesheet

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L23)

**Spritesheet**: uma textura dividida numa grade de frames de tamanho fixo. O
frame `index` (linha-a-linha, da esquerda pra direita, **0 = topo-esquerda**)
vira um recorte UV aplicável a uma textura (offset/repeat). Use com
[createAnimatedSprite](../functions/createAnimatedSprite.md) + [SpriteAnimationComponent](SpriteAnimationComponent.md).

## Constructors

### Constructor

> **new Spritesheet**(`texture`, `opts`): `Spritesheet`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L29)

#### Parameters

##### texture

`Texture`

Textura da folha (carregue com `loadTexture(url, { pixelated: true })`).

##### opts

[`SpritesheetOptions`](../interfaces/SpritesheetOptions.md)

#### Returns

`Spritesheet`

## Properties

### columns

> `readonly` **columns**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L26)

***

### frameHeight

> `readonly` **frameHeight**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L25)

***

### frameWidth

> `readonly` **frameWidth**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L24)

***

### rows

> `readonly` **rows**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L27)

***

### texture

> `readonly` **texture**: `Texture`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L31)

Textura da folha (carregue com `loadTexture(url, { pixelated: true })`).

## Accessors

### count

#### Get Signature

> **get** **count**(): `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L42)

Total de frames da grade.

##### Returns

`number`

## Methods

### applyFrame()

> **applyFrame**(`texture`, `index`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Spritesheet.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Spritesheet.ts#L50)

Aplica o recorte UV do frame `index` numa textura (define `offset`/`repeat`).
V é invertido (origem do three é embaixo) pra `0` ser o topo-esquerda.

#### Parameters

##### texture

`Texture`

##### index

`number`

#### Returns

`void`
