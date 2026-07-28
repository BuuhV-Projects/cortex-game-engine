[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FollowCamera2DOptions

# Interface: FollowCamera2DOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L13)

Opções da [FollowCamera2DSystem](../classes/FollowCamera2DSystem.md).

## Properties

### bounds?

> `optional` **bounds?**: `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L53)

Limites de enquadramento: trava o ponto seguido numa região do level.

#### maxX?

> `optional` **maxX?**: `number`

#### maxY?

> `optional` **maxY?**: `number`

#### minX?

> `optional` **minX?**: `number`

#### minY?

> `optional` **minY?**: `number`

***

### distance?

> `optional` **distance?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L17)

Distância da câmera no eixo Z (olha o plano XY de frente). Default `18`.

***

### isometric?

> `optional` **isometric?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L51)

Atalho: liga o **preset isométrico** (yaw 45° + pitch ≈35.264°). `yaw`/`pitch`
explícitos têm precedência. Use uma câmera **ortográfica** pra isometria
verdadeira (linhas paralelas) ou **perspectiva** pra "perspectiva isométrica"
(leve convergência). Default `false`.

***

### offset?

> `optional` **offset?**: \[`number`, `number`\]

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L15)

Deslocamento do ponto seguido em relação ao alvo (X, Y). Default `[0, 1]`.

***

### pitch?

> `optional` **pitch?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L36)

Pitch da câmera (inclinação no eixo X), em radianos — tilta a câmera pra
olhar o plano XY de cima/baixo num ângulo, dando **profundidade/parallax**
(o fundo em Z<0 desce, o primeiro plano em Z>0 sobe). Positivo = olhar de
cima pra baixo. **Travado em 0 por padrão** (olha reto); mude com
[FollowCamera2DSystem.setPitch](../classes/FollowCamera2DSystem.md#setpitch). Default `0`.

***

### responsiveness?

> `optional` **responsiveness?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L22)

Responsividade do follow (maior = mais "grudado"; menor = mais suave/lag).
Independente de frame-rate. `0` = instantâneo. Default `8`.

***

### roll?

> `optional` **roll?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L28)

Roll da câmera no eixo central (Z), em radianos — a "leve rotação" do 2.5D.
**Travado em 0 por padrão**; mude com [FollowCamera2DSystem.setRoll](../classes/FollowCamera2DSystem.md#setroll)
pra dar vida (estilo Rayman). Default `0`.

***

### yaw?

> `optional` **yaw?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FollowCamera2DSystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L44)

Yaw da câmera (giro em torno do eixo **Y vertical**), em radianos — orbita o
ponto seguido na horizontal, mostrando profundidade pela lateral. Combinado
com `pitch`, dá o ângulo 3/4 **isométrico** (vista de diorama). **Travado em
0 por padrão** (olha o plano XY de frente); mude com
[FollowCamera2DSystem.setYaw](../classes/FollowCamera2DSystem.md#setyaw). Default `0`.
