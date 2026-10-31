[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / clearRoadVegetation

# Function: clearRoadVegetation()

> **clearRoadVegetation**(`three`): `void`

Defined in: [src/scene/RoadBuild.ts:191](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/RoadBuild.ts#L191)

**Árvore não fica na pista** (SPEC-0631 §3b): esconde (sem apagar) toda instância de
nó `vegetation` a menos de `width/2 + clearance` do eixo de alguma estrada. Recalcula a
máscara inteira a cada chamada, então mover/apagar a estrada traz as árvores de volta.

## Parameters

### three

`Object3D`

## Returns

`void`
