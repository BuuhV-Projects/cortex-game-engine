[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CollectedScripts

# Interface: CollectedScripts

Defined in: [src/scripts/ScriptRegistry.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptRegistry.ts#L52)

Scripts de um módulo + se ele exporta algo que não é script (ver [collectScripts](../functions/collectScripts.md)).

## Properties

### foreign

> **foreign**: `boolean`

Defined in: [src/scripts/ScriptRegistry.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptRegistry.ts#L55)

O módulo exporta algum valor que não é subclasse de [ScriptBehavior](../classes/ScriptBehavior.md).

***

### scripts

> **scripts**: `object`[]

Defined in: [src/scripts/ScriptRegistry.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptRegistry.ts#L53)

#### ctor

> **ctor**: [`ScriptCtor`](../type-aliases/ScriptCtor.md)

#### name

> **name**: `string`
