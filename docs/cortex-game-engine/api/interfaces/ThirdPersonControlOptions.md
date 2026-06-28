[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonControlOptions

# Interface: ThirdPersonControlOptions

Defined in: [src/systems/ThirdPersonControlSystem.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L13)

Opções do [ThirdPersonControlSystem](../classes/ThirdPersonControlSystem.md) (porta o ThirdPersonController do Unity StarterAssets).

## Properties

### cameraDistance?

> `optional` **cameraDistance?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L23)

Distância da câmera atrás do personagem (m). Default 5.5.

***

### cameraHeight?

> `optional` **cameraHeight?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L25)

Altura do alvo que a câmera mira (m, acima dos pés). Default 1.5.

***

### facingOffset?

> `optional` **facingOffset?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L29)

Offset de orientação do modelo (rad) se o personagem nascer virado ao contrário. Default 0.

***

### invertLookY?

> `optional` **invertLookY?**: `boolean`

Defined in: [src/systems/ThirdPersonControlSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L33)

Inverte o eixo Y do stick direito (olhar). Default false.

***

### jumpBlocked?

> `optional` **jumpBlocked?**: () => `boolean`

Defined in: [src/systems/ThirdPersonControlSystem.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L39)

Bloqueia o pulo quando `true` — ex.: há interação em alcance, então A vira "interagir".

#### Returns

`boolean`

***

### moveSpeed?

> `optional` **moveSpeed?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L15)

Velocidade de caminhada (u/s). Default 2.0 (Unity MoveSpeed).

***

### padIndex?

> `optional` **padIndex?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L35)

Slot do gamepad (0..3). Default 0.

***

### padLookSpeed?

> `optional` **padLookSpeed?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L31)

Velocidade de orbita da câmera pelo stick direito do gamepad (rad/s). Default 2.6.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/ThirdPersonControlSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L37)

Pausa (ex.: `() => game.editorActive`). Quando true, não move/olha (mostra o corpo).

#### Returns

`boolean`

***

### rotationSmoothTime?

> `optional` **rotationSmoothTime?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L21)

Suavização da rotação do personagem ao virar (s). Default 0.12 (Unity RotationSmoothTime).

***

### runThreshold?

> `optional` **runThreshold?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L27)

Acima de qual velocidade troca walk→run (u/s). Default 3.5.

***

### sensitivity?

> `optional` **sensitivity?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L19)

Sensibilidade do mouse (rad/px). Default 0.0022.

***

### sprintSpeed?

> `optional` **sprintSpeed?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L17)

Velocidade de corrida com Shift (u/s). Default 5.335 (Unity SprintSpeed).
