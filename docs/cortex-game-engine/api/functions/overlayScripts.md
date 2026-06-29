[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayScripts

# Function: overlayScripts()

> **overlayScripts**(`overlay`): `Record`\<`string`, [`ScriptDecl`](../interfaces/ScriptDecl.md)[]\>

Defined in: [src/scene/SceneBuilder.ts:402](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L402)

Scripts anexados por nó vindos do overlay do editor (`data.scripts[id]` = lista de
`{ type, fields }`). Vence o `node.scripts` do código/JSON. Ver ADR-0085.

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`ScriptDecl`](../interfaces/ScriptDecl.md)[]\>
