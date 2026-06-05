[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupOutdoorLighting

# Function: setupOutdoorLighting()

> **setupOutdoorLighting**(`renderer`, `scene`, `options?`): [`OutdoorLighting`](../interfaces/OutdoorLighting.md)

Defined in: [src/scene/OutdoorLighting.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L73)

Preset de iluminação exterior "verão": configura o tone mapping cinematográfico
(ACES Filmic) e soft shadows (PCF) no renderer, e adiciona à cena um sol
direcional com sombras + um hemisphere (preenchimento céu/chão) + um ambient
discreto. Encapsula a configuração de shadow-camera/tone-mapping que, crua,
exige mexer no `WebGPURenderer` e no `DirectionalLight.shadow`.

Retorna as luzes pra ajuste fino (ex.: desligar a sombra do sol, mudar
intensidade, reposicionar). Pra excluir um objeto específico do shadowMap,
use `setShadows(obj, { castShadow: false })`.

## Parameters

### renderer

[`Renderer`](../classes/Renderer.md)

O [Renderer](../classes/Renderer.md) do jogo (tone mapping + shadowMap).

### scene

[`Scene`](../classes/Scene.md)

A [Scene](../classes/Scene.md) onde adicionar as luzes.

### options?

[`OutdoorLightingOptions`](../interfaces/OutdoorLightingOptions.md) = `{}`

Ver [OutdoorLightingOptions](../interfaces/OutdoorLightingOptions.md).

## Returns

[`OutdoorLighting`](../interfaces/OutdoorLighting.md)

`{ sun, hemisphere, ambient }`.

## Example

```ts
const lights = setupOutdoorLighting(renderer, scene, { sky: 0x9fc6e0 })
lights.sun.intensity = 2.4 // ajuste em runtime
```
