[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MeshPickMaps

# Interface: MeshPickMaps

Defined in: [src/probuilder/EditableMesh.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/EditableMesh.ts#L29)

Mapas que ligam a geometria de **render** (triangulada/flat) de volta à
topologia **lógica** — usados pelo editor pra resolver clique → face/vértice.

## Properties

### edges

> **edges**: \[`number`, `number`\][]

Defined in: [src/probuilder/EditableMesh.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/EditableMesh.ts#L35)

Arestas únicas da malha: pares `[a, b]` de índices lógicos com `a < b`.

***

### renderVertToVert

> **renderVertToVert**: `number`[]

Defined in: [src/probuilder/EditableMesh.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/EditableMesh.ts#L33)

Por vértice de render (índice): o vértice lógico de origem.

***

### triToFace

> **triToFace**: `number`[]

Defined in: [src/probuilder/EditableMesh.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/EditableMesh.ts#L31)

Por triângulo de render (índice): a face lógica de origem.
