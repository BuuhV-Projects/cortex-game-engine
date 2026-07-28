[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RendererOptions

# Interface: RendererOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Renderer.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L30)

## Properties

### antialias?

> `optional` **antialias?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Renderer.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L41)

Habilita anti-aliasing.

#### Default

```ts
true
```

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Renderer.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L32)

Elemento `<canvas>` onde a cena será renderizada.

***

### forceWebGL?

> `optional` **forceWebGL?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Renderer.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L48)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Renderer.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L36)

Altura inicial em pixels.

***

### width

> **width**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Renderer.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L34)

Largura inicial em pixels.
