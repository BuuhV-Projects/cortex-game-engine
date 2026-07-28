[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / decodeSignedSave

# Function: decodeSignedSave()

> **decodeSignedSave**(`token`, `secret`): `string` \| `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/io/signedSave.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/signedSave.ts#L117)

Decodifica um token de [encodeSignedSave](encodeSignedSave.md) com a MESMA `secret`.
Devolve o payload original, ou `null` se o token estiver **ausente**, num
**formato desconhecido** (ex.: save legado em JSON puro) ou **adulterado**
(assinatura não confere). O chamador trata `null` como "sem save".

## Parameters

### token

`string`

### secret

`string`

## Returns

`string` \| `null`
