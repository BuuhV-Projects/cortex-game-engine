[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererOptions

# Interface: RendererOptions

Defined in: [src/core/Renderer.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L44)

## Properties

### antialias?

> `optional` **antialias?**: `boolean`

Defined in: [src/core/Renderer.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L55)

Habilita anti-aliasing.

#### Default

```ts
true
```

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Renderer.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L46)

Elemento `<canvas>` onde a cena será renderizada.

***

### forceWebGL?

> `optional` **forceWebGL?**: `boolean`

Defined in: [src/core/Renderer.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L62)

Escape hatch: usa o backend WebGL2 em vez de WebGPU. Por padrão o engine
**exige** WebGPU e lança se ele não estiver disponível (sem fallback
silencioso). Reservado para casos específicos (ex.: futuro suporte a 2D).

#### Default

```ts
false
```

***

### height

> **height**: `number`

Defined in: [src/core/Renderer.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L50)

Altura inicial em pixels.

***

### width

> **width**: `number`

Defined in: [src/core/Renderer.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L48)

Largura inicial em pixels.
