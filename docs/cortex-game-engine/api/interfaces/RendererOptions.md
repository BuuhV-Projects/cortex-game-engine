[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererOptions

# Interface: RendererOptions

Defined in: [jge-present/src/core/Renderer.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L31)

## Properties

### antialias?

> `optional` **antialias?**: `boolean`

Defined in: [jge-present/src/core/Renderer.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L42)

Habilita anti-aliasing.

#### Default

```ts
true
```

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [jge-present/src/core/Renderer.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L33)

Elemento `<canvas>` onde a cena será renderizada.

***

### forceWebGL?

> `optional` **forceWebGL?**: `boolean`

Defined in: [jge-present/src/core/Renderer.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L49)

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

Defined in: [jge-present/src/core/Renderer.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L37)

Altura inicial em pixels.

***

### width

> **width**: `number`

Defined in: [jge-present/src/core/Renderer.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L35)

Largura inicial em pixels.
