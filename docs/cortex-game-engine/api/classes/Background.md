[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Background

# Class: Background

Defined in: src/scene/Background.ts:43

**Backdrop 2D com parallax** — um quad unlit, atrás de tudo, que segue a câmera
pra sempre preencher a vista e faz a imagem rolar em **parallax** conforme a
câmera anda (estilo plataforma). A imagem deve ser tileável na horizontal
(`RepeatWrapping`) pra rolar sem emenda. Não recebe luz/sombra/fog (é fundo).

Chame [Background.update](#update) no loop (o [buildScene](../functions/buildScene.md) já faz isso pelos
nós `background`). Use uma imagem por **tema/mood** (céu/cidade/floresta).

## Example

```ts
const bg = new Background(game.scene, game.camera, { url: 'assets/bg/adventure.jpg', parallax: 0.3 })
// no loop: bg.update()
```

## Constructors

### Constructor

> **new Background**(`scene`, `camera`, `options`): `Background`

Defined in: src/scene/Background.ts:51

#### Parameters

##### scene

[`Scene`](Scene.md)

##### camera

`PerspectiveCamera` \| `OrthographicCamera`

##### options

[`BackgroundOptions`](../interfaces/BackgroundOptions.md)

#### Returns

`Background`

## Properties

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: src/scene/Background.ts:45

O mesh do backdrop (já adicionado à cena).

## Methods

### update()

> **update**(): `void`

Defined in: src/scene/Background.ts:74

Reposiciona o backdrop atrás da câmera e rola a UV em parallax. Chame no loop.

#### Returns

`void`
