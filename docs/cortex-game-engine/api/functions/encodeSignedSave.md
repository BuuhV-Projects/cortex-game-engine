[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / encodeSignedSave

# Function: encodeSignedSave()

> **encodeSignedSave**(`payload`, `secret`): `string`

Defined in: src/io/signedSave.ts:103

Codifica `payload` num token assinado + ofuscado (`CXS1.<b64>.<b64>`).
Passe a `secret` do jogo (embutida). Ver notas de segurança no topo do módulo.

## Parameters

### payload

`string`

### secret

`string`

## Returns

`string`
