[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DebugHud

# Class: DebugHud

Defined in: [src/ui/DebugHud.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L104)

## Constructors

### Constructor

> **new DebugHud**(`ui`, `rendererInfo?`, `profiler?`): `DebugHud`

Defined in: [src/ui/DebugHud.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L121)

#### Parameters

##### ui

[`UiLayer`](UiLayer.md)

Camada de UI de runtime (`game.ui`).

##### rendererInfo?

() => `RendererInfoLike` \| `null`

Acessor opcional do `renderer.info` do three.

##### profiler?

`FrameProfiler`

Profiler por-subsistema opcional (breakdown por seção).

#### Returns

`DebugHud`

## Accessors

### visible

#### Get Signature

> **get** **visible**(): `boolean`

Defined in: [src/ui/DebugHud.ts:146](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L146)

Visível? O toggle do Studio (menu View) liga/desliga em runtime.

##### Returns

`boolean`

## Methods

### frame()

> **frame**(`deltaMs`): `void`

Defined in: [src/ui/DebugHud.ts:161](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L161)

Alimente 1×/frame com o delta em ms (o [Game](Game.md) faz isso).

#### Parameters

##### deltaMs

`number`

#### Returns

`void`

***

### setVisible()

> **setVisible**(`visible`): `void`

Defined in: [src/ui/DebugHud.ts:151](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L151)

Mostra/esconde o HUD (some da tela e para de medir/rasterizar).

#### Parameters

##### visible

`boolean`

#### Returns

`void`
