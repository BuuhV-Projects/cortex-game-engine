[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PostFX

# Class: PostFX

Defined in: [.claude/worktrees/feat-input-rebind/src/core/PostFX.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L78)

## Constructors

### Constructor

> **new PostFX**(`renderer`, `scene`, `camera`, `options?`): `PostFX`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/PostFX.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L114)

#### Parameters

##### renderer

[`Renderer`](Renderer.md)

Renderer do engine (usa o `WebGPURenderer` interno).

##### scene

[`Scene`](Scene.md)

Cena a renderizar.

##### camera

`Camera`

Câmera ativa.

##### options?

[`PostFXOptions`](../interfaces/PostFXOptions.md) = `{}`

Efeitos a aplicar (ex.: `{ bloom: true, fxaa: true }`).

#### Returns

`PostFX`

#### Example

```ts
const postfx = new PostFX(renderer, scene, camera, {
  bloom: { strength: 0.9 },
  vignette: true,
  fxaa: true,
  toneMapping: THREE.ACESFilmicToneMapping,
  exposure: 1.1,
});
// no loop, em vez de renderer.render(scene.getThreeScene(), camera):
postfx.render();
```

## Accessors

### bloom

#### Get Signature

> **get** **bloom**(): `BloomNode` \| `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/PostFX.ts:222](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L222)

Nó de bloom (ou `null` se desligado), pra ajuste em runtime:
`postfx.bloom?.strength.value = 1.2`.

##### Returns

`BloomNode` \| `null`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/PostFX.ts:227](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L227)

Libera os recursos GPU do pipeline.

#### Returns

`void`

***

### render()

> **render**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/PostFX.ts:203](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PostFX.ts#L203)

Renderiza a cena com os efeitos. Chame uma vez por frame no lugar de
`renderer.render(...)`. No-op enquanto o backend WebGPU ainda inicializa
(mesma guarda do `Renderer.render`).

#### Returns

`void`
