[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFXOptions

# Interface: PostFXOptions

Defined in: [src/core/PostFX.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L51)

## Properties

### bloom?

> `optional` **bloom?**: `boolean` \| [`BloomConfig`](BloomConfig.md)

Defined in: [src/core/PostFX.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L53)

Liga o bloom. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/core/PostFX.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L64)

Exposição do tone mapping. Quando omitido, mantém a do renderer.

***

### fxaa?

> `optional` **fxaa?**: `boolean`

Defined in: [src/core/PostFX.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L57)

Liga o FXAA (anti-aliasing de pós-processamento).

#### Default

```ts
false
```

***

### toneMapping?

> `optional` **toneMapping?**: `ToneMapping`

Defined in: [src/core/PostFX.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L62)

Tone mapping aplicado na saída (ex.: `THREE.ACESFilmicToneMapping`,
`THREE.AgXToneMapping`). Quando omitido, mantém o do renderer.

***

### vignette?

> `optional` **vignette?**: `boolean` \| [`VignetteConfig`](VignetteConfig.md)

Defined in: [src/core/PostFX.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L55)

Liga a vinheta. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```
