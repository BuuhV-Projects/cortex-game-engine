[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / hotReloadModel

# Function: hotReloadModel()

> **hotReloadModel**(`url`): `Promise`\<[`ModelHotReloadResult`](../interfaces/ModelHotReloadResult.md)\>

Defined in: [src/scene/ModelHotReload.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L93)

**Hot reload de GLB** (SPEC-0697 §3): recarrega `url` e troca os filhos de toda raiz
viva criada por `instance(await loadGLB(url))` com o registro ligado
([enableModelHotReload](enableModelHotReload.md)), **mantendo a raiz** (componentes, scripts e `byId`
continuam valendo). Reaplica o look gravado (matte → material → sombra → fog, na ordem
em que foi aplicado) e o raycast desligado dos scripts da raiz. Raiz animada ou presa a
ECS é pulada com `console.warn` — um Reiniciar resolve.

Chamadas para a mesma URL são serializadas.

## Parameters

### url

`string`

URL do GLB; `./`, `/` inicial e query são ignorados.

## Returns

`Promise`\<[`ModelHotReloadResult`](../interfaces/ModelHotReloadResult.md)\>
