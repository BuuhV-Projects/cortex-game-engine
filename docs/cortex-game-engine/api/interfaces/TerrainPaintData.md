[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainPaintData

# Interface: TerrainPaintData

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Terrain.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L48)

Pintura do terreno serializável (camadas + splatmap) — persistência do editor.

## Properties

### layers

> **layers**: [`TerrainPaintLayer`](TerrainPaintLayer.md)[]

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Terrain.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L50)

Camadas em uso (1–4; o índice é o canal RGBA do splatmap).

***

### size

> **size**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Terrain.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L52)

Lado do splatmap (quadrado, `size×size` texels).

***

### splat

> **splat**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Terrain.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L54)

Pesos RGBA do splatmap (`size*size*4` bytes) em base64.
