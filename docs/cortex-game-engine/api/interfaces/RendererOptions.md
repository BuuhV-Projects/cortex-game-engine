[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererOptions

# Interface: RendererOptions

Defined in: [src/core/Renderer.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L52)

## Properties

### antialias?

> `optional` **antialias?**: `boolean`

Defined in: [src/core/Renderer.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L63)

Habilita anti-aliasing.

#### Default

```ts
true
```

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Renderer.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L54)

Elemento `<canvas>` onde a cena será renderizada.

***

### forceWebGL?

> `optional` **forceWebGL?**: `boolean`

Defined in: [src/core/Renderer.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L70)

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

Defined in: [src/core/Renderer.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L58)

Altura inicial em pixels.

***

### width

> **width**: `number`

Defined in: [src/core/Renderer.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L56)

Largura inicial em pixels.
