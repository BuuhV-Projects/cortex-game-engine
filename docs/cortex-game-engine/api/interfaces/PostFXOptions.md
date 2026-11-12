[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFXOptions

# Interface: PostFXOptions

Defined in: [src/core/PostFX.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L56)

## Properties

### bloom?

> `optional` **bloom?**: `boolean` \| [`BloomConfig`](BloomConfig.md)

Defined in: [src/core/PostFX.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L58)

Liga o bloom. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/core/PostFX.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L69)

Exposição do tone mapping. Quando omitido, mantém a do renderer.

***

### fxaa?

> `optional` **fxaa?**: `boolean`

Defined in: [src/core/PostFX.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L62)

Liga o FXAA (anti-aliasing de pós-processamento).

#### Default

```ts
false
```

***

### toneMapping?

> `optional` **toneMapping?**: `ToneMapping`

Defined in: [src/core/PostFX.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L67)

Tone mapping aplicado na saída (ex.: `THREE.ACESFilmicToneMapping`,
`THREE.AgXToneMapping`). Quando omitido, mantém o do renderer.

***

### underwater?

> `optional` **underwater?**: `boolean`

Defined in: [src/core/PostFX.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L75)

Monta no grafo o efeito embaixo d'água de `renderer.setUnderwater` (SPEC-0726).
Só no navegador: no host o efeito é sempre do composite do C++. Ligado, custa
um pouco de ALU por pixel mesmo com `amount` 0.

#### Default

```ts
false
```

***

### vignette?

> `optional` **vignette?**: `boolean` \| [`VignetteConfig`](VignetteConfig.md)

Defined in: [src/core/PostFX.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L60)

Liga a vinheta. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```
