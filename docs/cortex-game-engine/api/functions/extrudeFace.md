[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / extrudeFace

# Function: extrudeFace()

> **extrudeFace**(`mesh`, `faceIndex`, `distance`): `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/EditableMesh.ts:199](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/EditableMesh.ts#L199)

**Extruda uma face** ao longo da sua normal por `distance` (op-chave de
blockout). Cria vértices novos (a face deslocada) + paredes laterais ligando o
anel antigo ao novo; a face original passa a apontar pros vértices novos.
Retorna uma malha nova (não-destrutivo) e o índice da face extrudada (a mesma
posição `faceIndex`, agora no topo). Convém entrar em "mover" logo depois.

## Parameters

### mesh

[`EditableMesh`](../interfaces/EditableMesh.md)

### faceIndex

`number`

### distance

`number`

## Returns

`object`

### faceIndex

> **faceIndex**: `number`

### mesh

> **mesh**: [`EditableMesh`](../interfaces/EditableMesh.md)
