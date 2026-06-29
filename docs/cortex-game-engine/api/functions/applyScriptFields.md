[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / applyScriptFields

# Function: applyScriptFields()

> **applyScriptFields**(`instance`, `type`, `fields`): `void`

Defined in: src/systems/ScriptHostSystem.ts:12

Aplica os valores dos campos (schema default + overrides da cena/Inspector) nas
propriedades da instância. Usado na 1ª criação e no live-edit do Inspector.

## Parameters

### instance

[`ScriptBehavior`](../classes/ScriptBehavior.md)

### type

`string`

### fields

`Record`\<`string`, `unknown`\>

## Returns

`void`
