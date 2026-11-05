[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / collectScripts

# Function: collectScripts()

> **collectScripts**(`path`, `mod`): [`CollectedScripts`](../interfaces/CollectedScripts.md)

Defined in: [src/scripts/ScriptRegistry.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptRegistry.ts#L68)

Lê os scripts de um módulo com a **regra de nome** do [registerScripts](registerScripts.md)
(`scriptName` > nome do arquivo > `class.name`). Compartilhada com o hot reload
(SPEC-0697) para os dois não divergirem. `foreign` marca qualquer export que não é
subclasse de [ScriptBehavior](../classes/ScriptBehavior.md) (função, objeto, primitivo) — tipos não contam,
somem na compilação. Um módulo que não é objeto conta como estrangeiro.

## Parameters

### path

`string`

Caminho do módulo (o nome do arquivo vira o nome do script).

### mod

`unknown`

O namespace do módulo (`import * as mod`).

## Returns

[`CollectedScripts`](../interfaces/CollectedScripts.md)
