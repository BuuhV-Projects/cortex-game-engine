[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / gamePlatform

# Function: gamePlatform()

> **gamePlatform**(`file?`): `Promise`\<[`GamePlatform`](../type-aliases/GamePlatform.md)\>

Defined in: .claude/worktrees/feat-input-rebind/src/core/gamePlatform.ts:34

Lê a plataforma do `cortex.json` (uma vez por sessão; o resultado é
memorizado). Arquivo ausente, JSON inválido ou valor desconhecido caem em
[DEFAULT\_PLATFORM](../variables/DEFAULT_PLATFORM.md) — nunca lança.

## Parameters

### file?

`string` = `'cortex.json'`

## Returns

`Promise`\<[`GamePlatform`](../type-aliases/GamePlatform.md)\>
