[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Tilemap

# Interface: Tilemap

Defined in: src/scene/Tilemap.ts:38

Resultado de [buildTilemap](../functions/buildTilemap.md).

## Properties

### mesh

> **mesh**: `Mesh`

Defined in: src/scene/Tilemap.ts:40

Mesh único da camada — adicione em `game.scene.add(mesh)`.

## Methods

### addColliders()

> **addColliders**(`world`, `isSolid?`): `void`

Defined in: src/scene/Tilemap.ts:46

Cria colliders (box) pros tiles **sólidos**, mesclando runs horizontais por
linha (menos entidades). `isSolid` decide quais índices colidem (default:
qualquer tile não-vazio). Os colliders são entidades `Transform + Collider2D`.

#### Parameters

##### world

[`World`](../classes/World.md)

##### isSolid?

(`tileIndex`) => `boolean`

#### Returns

`void`
