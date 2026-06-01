[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFXOptions

# Interface: PostFXOptions

Defined in: [src/core/PostFX.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L50)

## Properties

### bloom?

> `optional` **bloom?**: `boolean` \| [`BloomConfig`](BloomConfig.md)

Defined in: [src/core/PostFX.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L52)

Liga o bloom. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/core/PostFX.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L63)

Exposição do tone mapping. Quando omitido, mantém a do renderer.

***

### fxaa?

> `optional` **fxaa?**: `boolean`

Defined in: [src/core/PostFX.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L56)

Liga o FXAA (anti-aliasing de pós-processamento).

#### Default

```ts
false
```

***

### toneMapping?

> `optional` **toneMapping?**: `ToneMapping`

Defined in: [src/core/PostFX.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L61)

Tone mapping aplicado na saída (ex.: `THREE.ACESFilmicToneMapping`,
`THREE.AgXToneMapping`). Quando omitido, mantém o do renderer.

***

### vignette?

> `optional` **vignette?**: `boolean` \| [`VignetteConfig`](VignetteConfig.md)

Defined in: [src/core/PostFX.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L54)

Liga a vinheta. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```
