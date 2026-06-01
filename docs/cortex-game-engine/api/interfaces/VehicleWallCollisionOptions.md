[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleWallCollisionOptions

# Interface: VehicleWallCollisionOptions

Defined in: [src/physics/VehicleWallCollisionSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L10)

Opções do [VehicleWallCollisionSystem](../classes/VehicleWallCollisionSystem.md).

## Properties

### bumperHeight?

> `optional` **bumperHeight?**: `number`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L16)

Altura dos raios (acima do centro). Default 0.4.

***

### halfLength?

> `optional` **halfLength?**: `number`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L12)

Meia-distância do centro ao para-choque frontal. Default 2.2.

***

### halfWidth?

> `optional` **halfWidth?**: `number`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L14)

Meia-largura (offset lateral dos 3 raios). Default 1.1.

***

### maxFloorCos?

> `optional` **maxFloorCos?**: `number`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L18)

Acima deste cos(ângulo com a vertical) a superfície é "chão" e é ignorada. Default cos(50°).

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L26)

Quando retorna `true`, o sistema é pulado (ex.: modo editor).

#### Returns

`boolean`

***

### wallFriction?

> `optional` **wallFriction?**: `number`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L24)

Fração da velocidade horizontal perdida num impacto **frontal** (0..1).
Escala com a frontalidade (impacto raspante perde menos). Default 0 =
deslize puro, sem perder velocidade.
