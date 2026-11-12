[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFXOptions

# Interface: PostFXOptions

Defined in: [src/core/PostFX.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L57)

## Properties

### bloom?

> `optional` **bloom?**: `boolean` \| [`BloomConfig`](BloomConfig.md)

Defined in: [src/core/PostFX.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L59)

Liga o bloom. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/core/PostFX.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L70)

Exposição do tone mapping. Quando omitido, mantém a do renderer.

***

### fxaa?

> `optional` **fxaa?**: `boolean`

Defined in: [src/core/PostFX.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L63)

Liga o FXAA (anti-aliasing de pós-processamento).

#### Default

```ts
false
```

***

### toneMapping?

> `optional` **toneMapping?**: `ToneMapping`

Defined in: [src/core/PostFX.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L68)

Tone mapping aplicado na saída (ex.: `THREE.ACESFilmicToneMapping`,
`THREE.AgXToneMapping`). Quando omitido, mantém o do renderer.

***

### underwater?

> `optional` **underwater?**: `boolean`

Defined in: [src/core/PostFX.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L80)

Monta no grafo o efeito embaixo d'água de `renderer.setUnderwater` (SPEC-0726).
Só vale no navegador: no host o efeito é sempre do composite do C++, com ou sem
esta opção. Por isso vem ligado, para o Studio mostrar o mesmo que o export.
Custo zero com o efeito desligado: o `PostFX` monta dois grafos (com e sem a água) e
só usa o com água enquanto `setUnderwater` está ligado. A primeira troca compila o
shader, então aqueça como o caminho do `Renderer` (ligar, `precompile`, desligar).
`false` nem monta o grafo com água.

#### Default

```ts
true
```

***

### vignette?

> `optional` **vignette?**: `boolean` \| [`VignetteConfig`](VignetteConfig.md)

Defined in: [src/core/PostFX.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L61)

Liga a vinheta. `true` usa defaults; objeto ajusta os parâmetros.

#### Default

```ts
false
```
