[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DebugHud

# Class: DebugHud

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/DebugHud.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L102)

## Constructors

### Constructor

> **new DebugHud**(`ui`, `rendererInfo?`, `profiler?`): `DebugHud`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/DebugHud.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L119)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/DebugHud.ts:144](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L144)

Visível? O toggle do Studio (menu View) liga/desliga em runtime.

##### Returns

`boolean`

## Methods

### frame()

> **frame**(`deltaMs`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/DebugHud.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L159)

Alimente 1×/frame com o delta em ms (o [Game](Game.md) faz isso).

#### Parameters

##### deltaMs

`number`

#### Returns

`void`

***

### setVisible()

> **setVisible**(`visible`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/DebugHud.ts:149](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/DebugHud.ts#L149)

Mostra/esconde o HUD (some da tela e para de medir/rasterizar).

#### Parameters

##### visible

`boolean`

#### Returns

`void`
