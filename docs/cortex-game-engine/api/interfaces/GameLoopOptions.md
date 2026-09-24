[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameLoopOptions

# Interface: GameLoopOptions

Defined in: [src/core/GameLoop.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L14)

## Properties

### fixedStep?

> `optional` **fixedStep?**: `number`

Defined in: [src/core/GameLoop.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L30)

Intervalo do passo fixo em ms.

#### Default

```ts
16.67  (~60 FPS)
```

***

### maxFps?

> `optional` **maxFps?**: `number`

Defined in: [src/core/GameLoop.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L35)

Teto de quadros por segundo (ADR-0257). `0` ou ausente = sem teto.
Pode ser trocado depois com [GameLoop.maxFps](../classes/GameLoop.md#maxfps).

***

### onFixedUpdate?

> `optional` **onFixedUpdate?**: (`fixedDeltaTime`) => `void`

Defined in: [src/core/GameLoop.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L25)

Chamado em passo fixo com `fixedDeltaTime` constante.
Ideal para física e lógica determinística (ex: `World.tick` do ECS).

#### Parameters

##### fixedDeltaTime

`number`

#### Returns

`void`

***

### onUpdate

> **onUpdate**: (`deltaTime`) => `void`

Defined in: [src/core/GameLoop.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L20)

Chamado a cada frame com o tempo decorrido em ms desde o frame anterior,
**limitado a 100 ms** (frames mais lentos desaceleram o jogo em vez de
entregar um passo gigante que tunela a física — ver `MAX_DELTA_MS`).

#### Parameters

##### deltaTime

`number`

#### Returns

`void`
