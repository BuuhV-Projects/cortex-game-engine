[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererOptions

# Interface: RendererOptions

Defined in: [src/core/Renderer.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L55)

## Properties

### antialias?

> `optional` **antialias?**: `boolean`

Defined in: [src/core/Renderer.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L66)

Habilita anti-aliasing.

#### Default

```ts
true
```

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Renderer.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L57)

Elemento `<canvas>` onde a cena será renderizada.

***

### forceWebGL?

> `optional` **forceWebGL?**: `boolean`

Defined in: [src/core/Renderer.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L73)

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

Defined in: [src/core/Renderer.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L61)

Altura inicial em pixels.

***

### width

> **width**: `number`

Defined in: [src/core/Renderer.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L59)

Largura inicial em pixels.
