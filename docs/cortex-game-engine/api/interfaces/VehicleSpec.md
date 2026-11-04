[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleSpec

# Interface: VehicleSpec

Defined in: [src/physics/RapierPhysics.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L89)

Config de [RapierPhysics.createVehicle](../classes/RapierPhysics.md#createvehicle) (ADR-0081).

## Properties

### centerOfMass?

> `optional` **centerOfMass?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L106)

Centro de massa EXPLÍCITO (relativo à origem do corpo). **Baixo = anti-capotamento**
(carro estável em curva rápida); ex.: `{x:0,y:0,z:0}` (nível das rodas) ou negativo.
Quando definido, a massa vem daqui (o collider fica sem massa). Default: CM automático
do collider (no centro da caixa — alto, capota fácil).

***

### chassisFriction?

> `optional` **chassisFriction?**: `number`

Defined in: [src/physics/RapierPhysics.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L116)

Atrito do chassi ao raspar. Default 0.4.

***

### chassisHalfExtents

> **chassisHalfExtents**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L92)

Meia-extensão do chassi (box collider) — ex.: carro 4.85×1.4×2.27 → {2.42,0.7,1.13}.

***

### chassisOffset?

> `optional` **chassisOffset?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L99)

Desloca a CAIXA do chassi em relação à origem do corpo (= origem do `.glb`).
**Importante:** se a origem do modelo fica embaixo (nas rodas), suba a caixa
(`{x:0,y:~0.6,z:0}`) pra ela ficar ACIMA das rodas — senão a caixa encosta no chão
antes das rodas e o carro **flutua**. Default `{0,0,0}`.

***

### frictionSlip?

> `optional` **frictionSlip?**: `number`

Defined in: [src/physics/RapierPhysics.ts:125](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L125)

Grip lateral/longitudinal. Maior = mais aderente (arcade). Default 2.5.

***

### mass?

> `optional` **mass?**: `number`

Defined in: [src/physics/RapierPhysics.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L114)

Massa do chassi (kg). Default 1200.

***

### maxSuspensionTravel?

> `optional` **maxSuspensionTravel?**: `number`

Defined in: [src/physics/RapierPhysics.ts:123](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L123)

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L90)

***

### suspensionCompression?

> `optional` **suspensionCompression?**: `number`

Defined in: [src/physics/RapierPhysics.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L121)

***

### suspensionRelaxation?

> `optional` **suspensionRelaxation?**: `number`

Defined in: [src/physics/RapierPhysics.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L122)

***

### suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Defined in: [src/physics/RapierPhysics.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L119)

***

### suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Defined in: [src/physics/RapierPhysics.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L120)

***

### wheels

> **wheels**: [`VehicleWheelSpec`](VehicleWheelSpec.md)[]

Defined in: [src/physics/RapierPhysics.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L118)

As rodas (tipicamente 4: FL/FR dianteiras steering, RL/RR traseiras powered).

***

### yawInertiaScale?

> `optional` **yawInertiaScale?**: `number`

Defined in: [src/physics/RapierPhysics.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L112)

Escala da inércia de GUINADA (curva). `< 1` = carro mais ágil/leve pra virar (arcade);
`1` = físico (pode dar entendimento — vira a roda mas o carro custa a rodar). Default 1.
Só com `centerOfMass` definido. Editável ao vivo via [Vehicle.setMassProperties](../classes/Vehicle.md#setmassproperties).
