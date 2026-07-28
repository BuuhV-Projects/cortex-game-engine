[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InspectOrbit

# Interface: InspectOrbit

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L7)

Parâmetros de órbita ao redor de um alvo (ângulos em GRAUS).

## Properties

### dist?

> `optional` **dist?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L13)

Distância da câmera ao alvo (unidades). Omitido = auto (enquadra o alvo pelo bbox).

***

### pitch?

> `optional` **pitch?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L11)

Elevação (graus). Negativo olha DE CIMA pra baixo (mergulho). Default `-25`.

***

### target?

> `optional` **target?**: [`InspectTarget`](../type-aliases/InspectTarget.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L15)

Ponto observado. Default `'scene'` (centro do bounding box da cena).

***

### yaw?

> `optional` **yaw?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L9)

Azimute horizontal (graus). `0` = olhando pelo eixo +Z; cresce no sentido anti-horário visto de cima. Default `30`.
