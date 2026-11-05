[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / forEachLiveScriptSlot

# Function: forEachLiveScriptSlot()

> **forEachLiveScriptSlot**(`cb`): `void`

Defined in: [src/systems/ScriptHostSystem.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L29)

Itera os slots de script de todo [ScriptHostSystem](../classes/ScriptHostSystem.md) vivo — usado pelo hot reload
(SPEC-0697) para trocar a classe das instâncias. Cobre as entidades do último `update`
de cada host; slots sem instância (fora do Play) também passam.

## Parameters

### cb

(`slot`, `comp`, `entity`) => `void`

## Returns

`void`
