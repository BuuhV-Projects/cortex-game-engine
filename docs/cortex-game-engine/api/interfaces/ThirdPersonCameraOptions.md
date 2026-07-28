[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonCameraOptions

# Interface: ThirdPersonCameraOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonCameraSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L10)

Opções do [ThirdPersonCameraSystem](../classes/ThirdPersonCameraSystem.md).

## Properties

### behind?

> `optional` **behind?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonCameraSystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L12)

Distância atrás do alvo (no eixo do heading). Default 5.5.

***

### height?

> `optional` **height?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonCameraSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L14)

Altura acima do alvo. Default 2.2.

***

### lookAhead?

> `optional` **lookAhead?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonCameraSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L16)

Distância à frente do alvo pra onde a câmera olha. Default 10.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonCameraSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L20)

Quando retorna `true`, o sistema é pulado (ex.: modo editor).

#### Returns

`boolean`

***

### smoothness?

> `optional` **smoothness?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonCameraSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L18)

Fator do lerp exponencial — menor = mais "preguiçosa"/suave. Default 9.
