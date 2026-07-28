[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonControlOptions

# Interface: ThirdPersonControlOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L15)

Opções do [ThirdPersonControlSystem](../classes/ThirdPersonControlSystem.md) (porta o ThirdPersonController do Unity StarterAssets).

## Properties

### actions?

> `optional` **actions?**: [`InputActions`](../classes/InputActions.md) \| `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L60)

**Ações de input remapeáveis** (ADR-0164) — passe `game.actions` pra que
mover/olhar/correr/pular sigam os bindings que o jogador escolheu na tela
de Controles. Sem isso, valem as teclas fixas de sempre (WASD/setas,
Shift, Espaço, A e sticks), byte a byte. Passe `null` pra forçar o modo
fixo mesmo indo pelo `setupThirdPerson` (que injeta `game.actions`).

***

### cameraDistance?

> `optional` **cameraDistance?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L25)

Distância da câmera atrás do personagem (m). Default 5.5.

***

### cameraHeight?

> `optional` **cameraHeight?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L27)

Altura do alvo que a câmera mira (m, acima dos pés). Default 1.5.

***

### facingOffset?

> `optional` **facingOffset?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L31)

Offset de orientação do modelo (rad) se o personagem nascer virado ao contrário. Default 0.

***

### initialPitch?

> `optional` **initialPitch?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L52)

Pitch inicial da câmera (rad; positivo = de cima). Default 0.35.

***

### initialYaw?

> `optional` **initialYaw?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L50)

Yaw inicial da câmera (rad). Default 0 (câmera atrás de +Z).

***

### invertLookY?

> `optional` **invertLookY?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L35)

Inverte o eixo Y do stick direito (olhar). Default false.

***

### jumpBlocked?

> `optional` **jumpBlocked?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L41)

Bloqueia o pulo quando `true` — ex.: há interação em alcance, então A vira "interagir".

#### Returns

`boolean`

***

### moveSpeed?

> `optional` **moveSpeed?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L17)

Velocidade de caminhada (u/s). Default 2.0 (Unity MoveSpeed).

***

### orbit?

> `optional` **orbit?**: `"free"` \| `"locked"`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L48)

Modo da câmera: `free` (default) = orbital por mouse/stick (pointer lock);
`locked` = ângulo FIXO (yaw/pitch/distância) — câmera de perseguição elevada
estilo obstacle course (Fall Guys): segue o player sem o jogador pilotar.
Troque em runtime com [ThirdPersonControlSystem.setOrbit](../classes/ThirdPersonControlSystem.md#setorbit).

***

### padIndex?

> `optional` **padIndex?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L37)

Slot do gamepad (0..3). Default 0.

***

### padLookSpeed?

> `optional` **padLookSpeed?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L33)

Velocidade de orbita da câmera pelo stick direito do gamepad (rad/s). Default 2.6.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L39)

Pausa (ex.: `() => game.editorActive`). Quando true, não move/olha (mostra o corpo).

#### Returns

`boolean`

***

### rotationSmoothTime?

> `optional` **rotationSmoothTime?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L23)

Suavização da rotação do personagem ao virar (s). Default 0.12 (Unity RotationSmoothTime).

***

### runThreshold?

> `optional` **runThreshold?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L29)

Acima de qual velocidade troca walk→run (u/s). Default 3.5.

***

### sensitivity?

> `optional` **sensitivity?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L21)

Sensibilidade do mouse (rad/px). Default 0.0022.

***

### sprintSpeed?

> `optional` **sprintSpeed?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/ThirdPersonControlSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L19)

Velocidade de corrida com Shift (u/s). Default 5.335 (Unity SprintSpeed).
