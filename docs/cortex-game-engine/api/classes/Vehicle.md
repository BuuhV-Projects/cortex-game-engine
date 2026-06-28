[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Vehicle

# Class: Vehicle

Defined in: [src/physics/RapierPhysics.ts:322](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L322)

**Veículo raycast** (ADR-0081) — wrapper do `DynamicRayCastVehicleController` do
Rapier. Aplica motor/freio/esterço, avança a simulação do veículo e expõe o
transform do chassi e de cada roda (pra sincronizar as malhas do `.glb`). As rodas
raycastam o mundo Rapier (terreno = collider) no WASM. Crie via
[RapierPhysics.createVehicle](RapierPhysics.md#createvehicle); chame [Vehicle.update](#update) APÓS `physics.step()`.

## Constructors

### Constructor

> **new Vehicle**(`ctrl`, `body`, `wheels`): `Vehicle`

Defined in: [src/physics/RapierPhysics.ts:323](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L323)

#### Parameters

##### ctrl

`DynamicRayCastVehicleController`

##### body

`RigidBody`

##### wheels

[`VehicleWheelSpec`](../interfaces/VehicleWheelSpec.md)[]

As rodas, na ordem em que foram adicionadas.

#### Returns

`Vehicle`

## Properties

### wheels

> `readonly` **wheels**: [`VehicleWheelSpec`](../interfaces/VehicleWheelSpec.md)[]

Defined in: [src/physics/RapierPhysics.ts:327](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L327)

As rodas, na ordem em que foram adicionadas.

## Methods

### chassisRotation()

> **chassisRotation**(): [`QuatLike`](../interfaces/QuatLike.md)

Defined in: [src/physics/RapierPhysics.ts:363](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L363)

#### Returns

[`QuatLike`](../interfaces/QuatLike.md)

***

### chassisTranslation()

> **chassisTranslation**(): [`Vec3Like`](../interfaces/Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:359](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L359)

#### Returns

[`Vec3Like`](../interfaces/Vec3Like.md)

***

### forwardSpeed()

> **forwardSpeed**(): `number`

Defined in: [src/physics/RapierPhysics.ts:352](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L352)

Velocidade ao longo do forward (+Z local) do chassi, m/s (sinal = frente/ré).

#### Returns

`number`

***

### reset()

> **reset**(`position?`, `rotation?`): `void`

Defined in: [src/physics/RapierPhysics.ts:386](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L386)

Reseta o chassi (respawn): zera velocidades + (opcional) posiciona/orienta.

#### Parameters

##### position?

[`Vec3Like`](../interfaces/Vec3Like.md)

##### rotation?

[`QuatLike`](../interfaces/QuatLike.md)

#### Returns

`void`

***

### setBrake()

> **setBrake**(`force`): `void`

Defined in: [src/physics/RapierPhysics.ts:337](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L337)

Freio em todas as rodas.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setEngineForce()

> **setEngineForce**(`force`): `void`

Defined in: [src/physics/RapierPhysics.ts:331](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L331)

Força do motor nas rodas com tração (N). 0 = desliga.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setSteering()

> **setSteering**(`angle`): `void`

Defined in: [src/physics/RapierPhysics.ts:341](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L341)

Ângulo de esterço (rad) nas rodas que esterçam.

#### Parameters

##### angle

`number`

#### Returns

`void`

***

### update()

> **update**(`dt`): `void`

Defined in: [src/physics/RapierPhysics.ts:347](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L347)

Avança a física do veículo. Chame DEPOIS de `physics.step()`.

#### Parameters

##### dt

`number`

#### Returns

`void`

***

### wheelTransform()

> **wheelTransform**(`i`, `outPos`, `outQuat`): `void`

Defined in: [src/physics/RapierPhysics.ts:369](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L369)

Escreve em `outPos`/`outQuat` o transform MUNDIAL da roda `i` (pra a malha).

#### Parameters

##### i

`number`

##### outPos

`Vector3`

##### outQuat

`Quaternion`

#### Returns

`void`
