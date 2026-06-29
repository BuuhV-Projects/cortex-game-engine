[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayGeometry

# Function: overlayGeometry()

> **overlayGeometry**(`overlay`): `Record`\<`string`, [`EditableMesh`](../interfaces/EditableMesh.md)\>

Defined in: [src/scene/SceneBuilder.ts:360](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L360)

Lê `data.geometry` da overlay — a **geometria editada** (vértice/face) de nós
`mesh` autorada no editor, por id (`{ [id]: { positions, faces } }`). **Vence** a
receita `shape`/geometria do nó (ADR-0071). "Resetar forma" remove a entrada.

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`EditableMesh`](../interfaces/EditableMesh.md)\>
