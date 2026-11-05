[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / clearMaterialPresetCache

# Function: clearMaterialPresetCache()

> **clearMaterialPresetCache**(): `void`

Defined in: [src/scene/Materials.ts:286](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Materials.ts#L286)

**Despeja os presets de material e as rampas de tom** (SPEC-0196). Chamado
pelo `clearSceneAssetCaches` — os presets derivam dos materiais dos `.glb`
cacheados e seguem a mesma política de residência (SPEC-0152).

## Returns

`void`
