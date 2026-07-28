[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / autoDetectSceneFileWriter

# Function: autoDetectSceneFileWriter()

> **autoDetectSceneFileWriter**(`options?`): [`SceneFileWriter`](../interfaces/SceneFileWriter.md) \| `null`

Defined in: [src/io/autoDetectSceneFileWriter.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/autoDetectSceneFileWriter.ts#L14)

Escolhe o writer conforme o ambiente em runtime (sem `import.meta.env`, que
seria avaliado no build do engine, não no do jogo):

- Tauri (`window.__TAURI_INTERNALS__`/`__TAURI__`) → [TauriSceneFileWriter](../classes/TauriSceneFileWriter.md)
- caso contrário → [HttpSceneFileWriter](../classes/HttpSceneFileWriter.md) (dev server Vite)

Retorna `null` fora do browser.

## Parameters

### options?

#### httpUrl?

`string`

Endpoint do plugin Vite (dev).

#### path?

`string`

Caminho do scene-data relativo à raiz do projeto (ex.:
`assets/scene-data-fase2.json` — overlay por fase). Vale pros dois
ambientes; sem ele, cada writer usa seu default.

#### tauriPath?

`string`

Caminho do arquivo no Tauri (tem precedência sobre `path` no Tauri).

## Returns

[`SceneFileWriter`](../interfaces/SceneFileWriter.md) \| `null`
