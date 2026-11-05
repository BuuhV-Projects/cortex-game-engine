[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalk

# Class: SceneWalk

Defined in: [src/core/PerfTrace.ts:221](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L221)

**Censo da cena em rodízio** (SPEC-0334): anda `budget` nós por chamada e, ao fechar a volta, publica em
[SceneWalk.result](#result) o tamanho da árvore, as matrizes paradas e os nós no frustum.

## Constructors

### Constructor

> **new SceneWalk**(): `SceneWalk`

#### Returns

`SceneWalk`

## Accessors

### result

#### Get Signature

> **get** **result**(): [`SceneWalkResult`](../interfaces/SceneWalkResult.md) \| `null`

Defined in: [src/core/PerfTrace.ts:225](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L225)

Última volta completa, ou `null` antes da primeira.

##### Returns

[`SceneWalkResult`](../interfaces/SceneWalkResult.md) \| `null`

## Methods

### step()

> **step**(`scene`, `camera`, `budget`): `void`

Defined in: [src/core/PerfTrace.ts:230](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L230)

Avança a volta em até `budget` nós. A câmera precisa estar com `matrixWorldInverse` em dia.

#### Parameters

##### scene

`Object3D`

##### camera

`Camera`

##### budget

`number`

#### Returns

`void`
