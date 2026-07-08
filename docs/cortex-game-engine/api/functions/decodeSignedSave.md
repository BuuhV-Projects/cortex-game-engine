[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / decodeSignedSave

# Function: decodeSignedSave()

> **decodeSignedSave**(`token`, `secret`): `string` \| `null`

Defined in: src/io/signedSave.ts:117

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
