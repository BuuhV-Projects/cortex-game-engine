[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameLoopOptions

# Interface: GameLoopOptions

Defined in: [jge-present/src/core/GameLoop.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L13)

## Properties

### fixedStep?

> `optional` **fixedStep?**: `number`

Defined in: [jge-present/src/core/GameLoop.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L29)

Intervalo do passo fixo em ms.

#### Default

```ts
16.67  (~60 FPS)
```

***

### onFixedUpdate?

> `optional` **onFixedUpdate?**: (`fixedDeltaTime`) => `void`

Defined in: [jge-present/src/core/GameLoop.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L24)

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

Defined in: [jge-present/src/core/GameLoop.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L19)

Chamado a cada frame com o tempo decorrido em ms desde o frame anterior,
**limitado a 100 ms** (frames mais lentos desaceleram o jogo em vez de
entregar um passo gigante que tunela a física — ver `MAX_DELTA_MS`).

#### Parameters

##### deltaTime

`number`

#### Returns

`void`
