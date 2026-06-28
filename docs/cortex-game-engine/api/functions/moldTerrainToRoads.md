[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / moldTerrainToRoads

# Function: moldTerrainToRoads()

> **moldTerrainToRoads**(`three`): `void`

Defined in: [src/scene/SceneBuilder.ts:1240](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L1240)

**Post-pass: o terreno se adapta às estradas `cutfill`** (ADR-0072 Fase 2). Depois
de todos os nós posicionados, para cada terreno acumula o *cut & fill* (+ talude) de
cada estrada `cutfill` (reusando o greide já calculado em [applyRoad](applyRoad.md), guardado
em `cortexRoad.centerline`) e aplica via [Terrain.setRoadMolding](../classes/Terrain.md#setroadmolding) —
**não-destrutivo** (recalculado a cada build; mover/remover a estrada re-ajeita o
terreno sem cicatriz salva). Sem estradas `cutfill`, limpa a moldagem (idempotente).
Exportado pra o editor remoldar ao vivo após [applyRoad](applyRoad.md).

## Parameters

### three

`Object3D`

## Returns

`void`
