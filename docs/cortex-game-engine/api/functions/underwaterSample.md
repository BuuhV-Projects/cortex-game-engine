[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / underwaterSample

# Function: underwaterSample()

> **underwaterSample**(`sceneTexture`, `uniforms`): `any`

Defined in: src/core/UnderwaterPass.ts:152

Amostra `sceneTexture` com a UV da tela deslocada pela ondulação:
`uv.x + sin(tempo·speed + uv.y·frequency)·amplitude·amount`.

## Parameters

### sceneTexture

`any`

### uniforms

[`UnderwaterUniforms`](../interfaces/UnderwaterUniforms.md)

## Returns

`any`
