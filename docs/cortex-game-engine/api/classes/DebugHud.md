[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DebugHud

# Class: DebugHud

Defined in: [src/ui/DebugHud.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L51)

## Constructors

### Constructor

> **new DebugHud**(`ui`, `rendererInfo?`): `DebugHud`

Defined in: [src/ui/DebugHud.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L65)

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

Camada de UI de runtime (`game.ui`).

##### rendererInfo?

() => `RendererInfoLike` \| `null`

Acessor opcional do `renderer.info` do three.

#### Returns

`DebugHud`

## Accessors

### visible

#### Get Signature

> **get** **visible**(): `boolean`

Defined in: [src/ui/DebugHud.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L80)

Visível? O toggle do Studio (menu View) liga/desliga em runtime.

##### Returns

`boolean`

## Methods

### frame()

> **frame**(`deltaMs`): `void`

Defined in: [src/ui/DebugHud.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L95)

Alimente 1×/frame com o delta em ms (o [Game](Game.md) faz isso).

#### Parameters

##### deltaMs

`number`

#### Returns

`void`

***

### setVisible()

> **setVisible**(`visible`): `void`

Defined in: [src/ui/DebugHud.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L85)

Mostra/esconde o HUD (some da tela e para de medir/rasterizar).

#### Parameters

##### visible

`boolean`

#### Returns

`void`
