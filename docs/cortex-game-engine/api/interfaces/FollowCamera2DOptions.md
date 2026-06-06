[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FollowCamera2DOptions

# Interface: FollowCamera2DOptions

Defined in: [src/systems/FollowCamera2DSystem.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L8)

Opções da [FollowCamera2DSystem](../classes/FollowCamera2DSystem.md).

## Properties

### bounds?

> `optional` **bounds?**: `object`

Defined in: [src/systems/FollowCamera2DSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L33)

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

Defined in: [src/systems/FollowCamera2DSystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L12)

Distância da câmera no eixo Z (olha o plano XY de frente). Default `18`.

***

### offset?

> `optional` **offset?**: \[`number`, `number`\]

Defined in: [src/systems/FollowCamera2DSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L10)

Deslocamento do ponto seguido em relação ao alvo (X, Y). Default `[0, 1]`.

***

### pitch?

> `optional` **pitch?**: `number`

Defined in: [src/systems/FollowCamera2DSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L31)

Pitch da câmera (inclinação no eixo X), em radianos — tilta a câmera pra
olhar o plano XY de cima/baixo num ângulo, dando **profundidade/parallax**
(o fundo em Z<0 desce, o primeiro plano em Z>0 sobe). Positivo = olhar de
cima pra baixo. **Travado em 0 por padrão** (olha reto); mude com
[FollowCamera2DSystem.setPitch](../classes/FollowCamera2DSystem.md#setpitch). Default `0`.

***

### responsiveness?

> `optional` **responsiveness?**: `number`

Defined in: [src/systems/FollowCamera2DSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L17)

Responsividade do follow (maior = mais "grudado"; menor = mais suave/lag).
Independente de frame-rate. `0` = instantâneo. Default `8`.

***

### roll?

> `optional` **roll?**: `number`

Defined in: [src/systems/FollowCamera2DSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L23)

Roll da câmera no eixo central (Z), em radianos — a "leve rotação" do 2.5D.
**Travado em 0 por padrão**; mude com [FollowCamera2DSystem.setRoll](../classes/FollowCamera2DSystem.md#setroll)
pra dar vida (estilo Rayman). Default `0`.
