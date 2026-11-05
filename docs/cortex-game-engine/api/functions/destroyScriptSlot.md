[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / destroyScriptSlot

# Function: destroyScriptSlot()

> **destroyScriptSlot**(`slot`): `void`

Defined in: [src/systems/ScriptHostSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L37)

Derruba a instância de um slot: `restoreRaycasts` + `onDestroy` (exceção vira
`debug('script', …)`), zera `instance` e `started`. Sem instância, nada faz.

## Parameters

### slot

[`ScriptSlot`](../interfaces/ScriptSlot.md)

## Returns

`void`
