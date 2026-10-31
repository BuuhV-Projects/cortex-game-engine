[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / moldTerrainToRoads

# Function: moldTerrainToRoads()

> **moldTerrainToRoads**(`three`, `terrains?`): `void`

Defined in: [src/scene/RoadBuild.ts:237](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/RoadBuild.ts#L237)

**Corte e aterro** (SPEC-0631 §3): para cada terreno, junta o delta de toda estrada cuja
caixa (± alcance) encosta nele e aplica com [Terrain.setRoadMolding](../classes/Terrain.md#setroadmolding) (não
destrutivo). Terreno sem estrada perto fica sem moldagem (idempotente). Também tira a
vegetação do corredor ([clearRoadVegetation](clearRoadVegetation.md)).

## Parameters

### three

`Object3D`

### terrains?

`TerrainRef`[] = `...`

## Returns

`void`
