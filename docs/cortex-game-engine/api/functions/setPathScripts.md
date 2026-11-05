[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setPathScripts

# Function: setPathScripts()

> **setPathScripts**(`path`, `names`): `string`[]

Defined in: [src/scripts/ScriptRegistry.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptRegistry.ts#L101)

Grava os nomes que o módulo `path` registrou e devolve os da vez anterior — o hot
reload derruba os que sumiram (SPEC-0697). `./scripts/X.ts` (glob do `main.ts`) e
`scripts/X.ts` (plugin) são o mesmo caminho.

## Parameters

### path

`string`

### names

`string`[]

## Returns

`string`[]
