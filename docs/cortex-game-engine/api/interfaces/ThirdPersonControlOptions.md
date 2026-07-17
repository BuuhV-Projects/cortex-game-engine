[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonControlOptions

# Interface: ThirdPersonControlOptions

Defined in: [src/systems/ThirdPersonControlSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L14)

Opções do [ThirdPersonControlSystem](../classes/ThirdPersonControlSystem.md) (porta o ThirdPersonController do Unity StarterAssets).

## Properties

### cameraDistance?

> `optional` **cameraDistance?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L24)

Distância da câmera atrás do personagem (m). Default 5.5.

***

### cameraHeight?

> `optional` **cameraHeight?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L26)

Altura do alvo que a câmera mira (m, acima dos pés). Default 1.5.

***

### facingOffset?

> `optional` **facingOffset?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L30)

Offset de orientação do modelo (rad) se o personagem nascer virado ao contrário. Default 0.

***

### initialPitch?

> `optional` **initialPitch?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L51)

Pitch inicial da câmera (rad; positivo = de cima). Default 0.35.

***

### initialYaw?

> `optional` **initialYaw?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L49)

Yaw inicial da câmera (rad). Default 0 (câmera atrás de +Z).

***

### invertLookY?

> `optional` **invertLookY?**: `boolean`

Defined in: [src/systems/ThirdPersonControlSystem.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L34)

Inverte o eixo Y do stick direito (olhar). Default false.

***

### jumpBlocked?

> `optional` **jumpBlocked?**: () => `boolean`

Defined in: [src/systems/ThirdPersonControlSystem.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L40)

Bloqueia o pulo quando `true` — ex.: há interação em alcance, então A vira "interagir".

#### Returns

`boolean`

***

### moveSpeed?

> `optional` **moveSpeed?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L16)

Velocidade de caminhada (u/s). Default 2.0 (Unity MoveSpeed).

***

### orbit?

> `optional` **orbit?**: `"free"` \| `"locked"`

Defined in: [src/systems/ThirdPersonControlSystem.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L47)

Modo da câmera: `free` (default) = orbital por mouse/stick (pointer lock);
`locked` = ângulo FIXO (yaw/pitch/distância) — câmera de perseguição elevada
estilo obstacle course (Fall Guys): segue o player sem o jogador pilotar.
Troque em runtime com [ThirdPersonControlSystem.setOrbit](../classes/ThirdPersonControlSystem.md#setorbit).

***

### padIndex?

> `optional` **padIndex?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L36)

Slot do gamepad (0..3). Default 0.

***

### padLookSpeed?

> `optional` **padLookSpeed?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L32)

Velocidade de orbita da câmera pelo stick direito do gamepad (rad/s). Default 2.6.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/ThirdPersonControlSystem.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L38)

Pausa (ex.: `() => game.editorActive`). Quando true, não move/olha (mostra o corpo).

#### Returns

`boolean`

***

### rotationSmoothTime?

> `optional` **rotationSmoothTime?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L22)

Suavização da rotação do personagem ao virar (s). Default 0.12 (Unity RotationSmoothTime).

***

### runThreshold?

> `optional` **runThreshold?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L28)

Acima de qual velocidade troca walk→run (u/s). Default 3.5.

***

### sensitivity?

> `optional` **sensitivity?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L20)

Sensibilidade do mouse (rad/px). Default 0.0022.

***

### sprintSpeed?

> `optional` **sprintSpeed?**: `number`

Defined in: [src/systems/ThirdPersonControlSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L18)

Velocidade de corrida com Shift (u/s). Default 5.335 (Unity SprintSpeed).
