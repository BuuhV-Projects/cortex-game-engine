[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TopDownCameraOptions

# Interface: TopDownCameraOptions

Defined in: [src/systems/TopDownCameraSystem.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L8)

Opções da [TopDownCameraSystem](../classes/TopDownCameraSystem.md).

## Properties

### angle?

> `optional` **angle?**: `number`

Defined in: [src/systems/TopDownCameraSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L16)

Inclinação a partir do **reto pra baixo**, em radianos: `0` = vista de cima
pura (pixel art de fazenda), `>0` = puxa a câmera pra trás (no +Z) dando o
ângulo 3/4 estilo Stardew/RPG. Default `0`.

***

### bounds?

> `optional` **bounds?**: `object`

Defined in: [src/systems/TopDownCameraSystem.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L25)

Limites de enquadramento no plano XZ (trava o ponto seguido na região).

#### maxX?

> `optional` **maxX?**: `number`

#### maxZ?

> `optional` **maxZ?**: `number`

#### minX?

> `optional` **minX?**: `number`

#### minZ?

> `optional` **minZ?**: `number`

***

### height?

> `optional` **height?**: `number`

Defined in: [src/systems/TopDownCameraSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L10)

Distância da câmera ao alvo (altura quando reto). Default `20`.

***

### offset?

> `optional` **offset?**: \[`number`, `number`\]

Defined in: [src/systems/TopDownCameraSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L23)

Deslocamento do ponto seguido no plano (X, Z). Default `[0, 0]`.

***

### responsiveness?

> `optional` **responsiveness?**: `number`

Defined in: [src/systems/TopDownCameraSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L21)

Responsividade do follow (maior = mais "grudado"; menor = mais suave).
Independente de frame-rate. `0` = instantâneo. Default `8`.
