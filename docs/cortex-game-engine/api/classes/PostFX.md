[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFX

# Class: PostFX

Defined in: [src/core/PostFX.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L69)

## Constructors

### Constructor

> **new PostFX**(`renderer`, `scene`, `camera`, `options?`): `PostFX`

Defined in: [src/core/PostFX.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L91)

#### Parameters

##### renderer

[`Renderer`](Renderer.md)

Renderer do engine (usa o `WebGPURenderer` interno).

##### scene

[`Scene`](Scene.md)

Cena a renderizar.

##### camera

`Camera`

Câmera ativa.

##### options?

[`PostFXOptions`](../interfaces/PostFXOptions.md) = `{}`

Efeitos a aplicar (ex.: `{ bloom: true, fxaa: true }`).

#### Returns

`PostFX`

#### Example

```ts
const postfx = new PostFX(renderer, scene, camera, {
  bloom: { strength: 0.9 },
  vignette: true,
  fxaa: true,
  toneMapping: THREE.ACESFilmicToneMapping,
  exposure: 1.1,
});
// no loop, em vez de renderer.render(scene.getThreeScene(), camera):
postfx.render();
```

## Accessors

### bloom

#### Get Signature

> **get** **bloom**(): `BloomNode` \| `null`

Defined in: [src/core/PostFX.ts:154](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L154)

Nó de bloom (ou `null` se desligado), pra ajuste em runtime:
`postfx.bloom?.strength.value = 1.2`.

##### Returns

`BloomNode` \| `null`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/core/PostFX.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L159)

Libera os recursos GPU do pipeline.

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [src/core/PostFX.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L145)

Renderiza a cena com os efeitos. Chame uma vez por frame no lugar de
`renderer.render(...)`. No-op enquanto o backend WebGPU ainda inicializa
(mesma guarda do `Renderer.render`).

#### Returns

`void`
