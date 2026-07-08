[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadKtx2

# Function: loadKtx2()

> **loadKtx2**(`url`, `renderer?`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: src/core/loadKtx2.ts:98

Carrega uma textura **KTX2** escolhendo o transcoder do ambiente:
- host nativo → [loadKtx2Native](loadKtx2Native.md) (basis_universal em C++);
- browser/Studio → `KTX2Loader` do three (WASM). Passe o `renderer` p/
  `detectSupport` — sem ele cai pra RGBA32 (ok na Fase 1, que já é RGBA).

Use direto pra `.ktx2`; pra "qualquer textura" o ponto único é o
`loadTexture` do `SceneAssets` (que chama este quando a URL é `.ktx2`).

## Parameters

### url

`string`

### renderer?

`unknown`

o `WebGPURenderer`/`WebGLRenderer` (só no caminho browser).

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
