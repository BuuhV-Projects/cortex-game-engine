[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / toBufferGeometry

# Function: toBufferGeometry()

> **toBufferGeometry**(`mesh`): [`RenderMesh`](../interfaces/RenderMesh.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/EditableMesh.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/EditableMesh.ts#L115)

Converte a malha lógica numa BufferGeometry de render **flat-shaded**:
fan-triangula cada face (assume face **convexa**) e duplica os vértices por
face com a **normal da face** — dá o look facetado certo de blockout. Devolve
também os mapas de picking (triângulo→face, vértice de render→vértice lógico).

## Parameters

### mesh

[`EditableMesh`](../interfaces/EditableMesh.md)

## Returns

[`RenderMesh`](../interfaces/RenderMesh.md)
