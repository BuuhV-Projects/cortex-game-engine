[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / autoMapPlayerClips

# Function: autoMapPlayerClips()

> **autoMapPlayerClips**(`available`, `explicit?`): `Record`\<`string`, `string`\>

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/PlatformerAnimationSystem.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerAnimationSystem.ts#L34)

Completa um mapa ação→clipe **auto-mapeando pelos nomes** dos clipes disponíveis
(idle→"Idle", run→"Running_A", jump→"Jump"…). O `explicit` (JSON/editor) tem
precedência; só preenche o que falta. Cobre os nomes KayKit/Quaternius.

## Parameters

### available

readonly `string`[]

### explicit?

`Record`\<`string`, `string`\> = `{}`

## Returns

`Record`\<`string`, `string`\>
