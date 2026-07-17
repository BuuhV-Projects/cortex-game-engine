[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DebugHud

# Class: DebugHud

Defined in: src/ui/DebugHud.ts:51

## Constructors

### Constructor

> **new DebugHud**(`ui`, `rendererInfo?`): `DebugHud`

Defined in: src/ui/DebugHud.ts:63

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

Camada de UI de runtime (`game.ui`).

##### rendererInfo?

() => `RendererInfoLike` \| `null`

Acessor opcional do `renderer.info` do three.

#### Returns

`DebugHud`

## Methods

### frame()

> **frame**(`deltaMs`): `void`

Defined in: src/ui/DebugHud.ts:78

Alimente 1×/frame com o delta em ms (o [Game](Game.md) faz isso).

#### Parameters

##### deltaMs

`number`

#### Returns

`void`
