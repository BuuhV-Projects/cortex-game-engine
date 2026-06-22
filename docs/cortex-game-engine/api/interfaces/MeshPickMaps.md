[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MeshPickMaps

# Interface: MeshPickMaps

Defined in: src/probuilder/EditableMesh.ts:29

Mapas que ligam a geometria de **render** (triangulada/flat) de volta à
topologia **lógica** — usados pelo editor pra resolver clique → face/vértice.

## Properties

### edges

> **edges**: \[`number`, `number`\][]

Defined in: src/probuilder/EditableMesh.ts:35

Arestas únicas da malha: pares `[a, b]` de índices lógicos com `a < b`.

***

### renderVertToVert

> **renderVertToVert**: `number`[]

Defined in: src/probuilder/EditableMesh.ts:33

Por vértice de render (índice): o vértice lógico de origem.

***

### triToFace

> **triToFace**: `number`[]

Defined in: src/probuilder/EditableMesh.ts:31

Por triângulo de render (índice): a face lógica de origem.
