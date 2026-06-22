[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonControlOptions

# Interface: ThirdPersonControlOptions

Defined in: src/systems/ThirdPersonControlSystem.ts:12

Opções do [ThirdPersonControlSystem](../classes/ThirdPersonControlSystem.md) (porta o ThirdPersonController do Unity StarterAssets).

## Properties

### cameraDistance?

> `optional` **cameraDistance?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:22

Distância da câmera atrás do personagem (m). Default 5.5.

***

### cameraHeight?

> `optional` **cameraHeight?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:24

Altura do alvo que a câmera mira (m, acima dos pés). Default 1.5.

***

### facingOffset?

> `optional` **facingOffset?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:28

Offset de orientação do modelo (rad) se o personagem nascer virado ao contrário. Default 0.

***

### moveSpeed?

> `optional` **moveSpeed?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:14

Velocidade de caminhada (u/s). Default 2.0 (Unity MoveSpeed).

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: src/systems/ThirdPersonControlSystem.ts:30

Pausa (ex.: `() => game.editorActive`). Quando true, não move/olha (mostra o corpo).

#### Returns

`boolean`

***

### rotationSmoothTime?

> `optional` **rotationSmoothTime?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:20

Suavização da rotação do personagem ao virar (s). Default 0.12 (Unity RotationSmoothTime).

***

### runThreshold?

> `optional` **runThreshold?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:26

Acima de qual velocidade troca walk→run (u/s). Default 3.5.

***

### sensitivity?

> `optional` **sensitivity?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:18

Sensibilidade do mouse (rad/px). Default 0.0022.

***

### sprintSpeed?

> `optional` **sprintSpeed?**: `number`

Defined in: src/systems/ThirdPersonControlSystem.ts:16

Velocidade de corrida com Shift (u/s). Default 5.335 (Unity SprintSpeed).
