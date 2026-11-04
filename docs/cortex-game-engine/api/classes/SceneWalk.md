[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalk

# Class: SceneWalk

Defined in: [src/core/perfTrace/sceneCensus.ts:141](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L141)

**Censo da cena em rodízio** (SPEC-0334): UMA travessia iterativa que anda
`budget` nós por chamada e, ao fechar a volta, publica em [result](#result)
o que antes custava três travessias completas por amostra (`countNodes`,
`countUnchangedMatrices`, `collectVisible` — ~25 ms em 10 mil nós no
Hermes, 2×/s, o que inflava o p95 de toda medição).

A pilha é própria (três arrays paralelos, sem alocar por nó) e carrega o id
do nó de cena herdado, então a malha não sobe a hierarquia atrás dele.
A árvore pode mudar no meio da volta: nó removido ainda conta nesta volta,
nó novo entra na próxima. O frustum é o da câmera no quadro da visita.

## Constructors

### Constructor

> **new SceneWalk**(): `SceneWalk`

#### Returns

`SceneWalk`

## Properties

### result

> **result**: [`SceneWalkResult`](../interfaces/SceneWalkResult.md) \| `null` = `null`

Defined in: [src/core/perfTrace/sceneCensus.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L143)

Última volta completa, ou `null` antes da primeira.

## Methods

### step()

> **step**(`scene`, `camera`, `budget`): `void`

Defined in: [src/core/perfTrace/sceneCensus.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L159)

Avança a volta em até `budget` nós. A câmera precisa estar com
`matrixWorldInverse` em dia (o render do quadro já fez).

#### Parameters

##### scene

`Object3D`

##### camera

`Camera`

##### budget

`number`

#### Returns

`void`
