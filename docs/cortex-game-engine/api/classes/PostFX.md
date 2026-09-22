[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFX

# Class: PostFX

Defined in: [src/core/PostFX.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L79)

## Constructors

### Constructor

> **new PostFX**(`renderer`, `scene`, `camera`, `options?`): `PostFX`

Defined in: [src/core/PostFX.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L115)

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

Defined in: [src/core/PostFX.ts:240](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L240)

Nó de bloom (ou `null` se desligado), pra ajuste em runtime:
`postfx.bloom?.strength.value = 1.2`.

##### Returns

`BloomNode` \| `null`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/core/PostFX.ts:245](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L245)

Libera os recursos GPU do pipeline.

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [src/core/PostFX.ts:207](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L207)

#### Returns

`void`
