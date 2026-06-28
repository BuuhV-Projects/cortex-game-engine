[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierPhysics

# Class: RapierPhysics

Defined in: [src/physics/RapierPhysics.ts:215](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L215)

## Properties

### world

> `readonly` **world**: `World`

Defined in: [src/physics/RapierPhysics.ts:217](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L217)

Mundo do Rapier (uso avançado).

## Methods

### addBody()

> **addBody**(`spec`): [`PhysicsBody`](../interfaces/PhysicsBody.md)

Defined in: [src/physics/RapierPhysics.ts:230](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L230)

Adiciona um corpo (RigidBody + Collider) e devolve seu handle.

#### Parameters

##### spec

[`BodySpec`](../interfaces/BodySpec.md)

#### Returns

[`PhysicsBody`](../interfaces/PhysicsBody.md)

***

### createVehicle()

> **createVehicle**(`spec`): [`Vehicle`](Vehicle.md)

Defined in: [src/physics/RapierPhysics.ts:255](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L255)

Cria um **veículo raycast** (ADR-0081) — chassi (rigid body dinâmico + box) +
rodas por raycast com suspensão/esterço/motor/freio, via o
`DynamicRayCastVehicleController` do Rapier. As rodas raycastam o mundo Rapier
(terreno precisa ser collider), tudo no WASM (sem custo de CPU/JS). Ver [Vehicle](Vehicle.md).

#### Parameters

##### spec

[`VehicleSpec`](../interfaces/VehicleSpec.md)

#### Returns

[`Vehicle`](Vehicle.md)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/physics/RapierPhysics.ts:291](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L291)

Libera o mundo (memória WASM).

#### Returns

`void`

***

### step()

> **step**(): `void`

Defined in: [src/physics/RapierPhysics.ts:245](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L245)

Avança a simulação um passo (timestep fixo configurado no mundo).

#### Returns

`void`

***

### create()

> `static` **create**(`gravity?`): `Promise`\<`RapierPhysics`\>

Defined in: [src/physics/RapierPhysics.ts:224](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L224)

Inicializa o Rapier (async) e cria o mundo com a gravidade dada.

#### Parameters

##### gravity?

[`Vec3Like`](../interfaces/Vec3Like.md) = `...`

#### Returns

`Promise`\<`RapierPhysics`\>
