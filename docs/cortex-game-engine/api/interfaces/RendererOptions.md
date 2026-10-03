[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererOptions

# Interface: RendererOptions

Defined in: [src/core/Renderer.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L38)

## Properties

### antialias?

> `optional` **antialias?**: `boolean`

Defined in: [src/core/Renderer.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L49)

Habilita anti-aliasing.

#### Default

```ts
true
```

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Renderer.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L40)

Elemento `<canvas>` onde a cena será renderizada.

***

### forceWebGL?

> `optional` **forceWebGL?**: `boolean`

Defined in: [src/core/Renderer.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L56)

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

Defined in: [src/core/Renderer.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L44)

Altura inicial em pixels.

***

### width

> **width**: `number`

Defined in: [src/core/Renderer.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L42)

Largura inicial em pixels.
