[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierPhysics

# Class: RapierPhysics

Defined in: [src/physics/RapierPhysics.ts:229](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L229)

## Properties

### world

> `readonly` **world**: `World`

Defined in: [src/physics/RapierPhysics.ts:231](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L231)

Mundo do Rapier (uso avançado).

## Methods

### addBody()

> **addBody**(`spec`): [`PhysicsBody`](../interfaces/PhysicsBody.md)

Defined in: [src/physics/RapierPhysics.ts:244](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L244)

Adiciona um corpo (RigidBody + Collider) e devolve seu handle.

#### Parameters

##### spec

[`BodySpec`](../interfaces/BodySpec.md)

#### Returns

[`PhysicsBody`](../interfaces/PhysicsBody.md)

***

### addTrimesh()

> **addTrimesh**(`vertices`, `indices`, `position?`): `void`

Defined in: [src/physics/RapierPhysics.ts:264](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L264)

Adiciona um collider **trimesh estático** (fixo) — pro chão/terreno/road.

#### Parameters

##### vertices

`Float32Array`

##### indices

`Uint32Array`

##### position?

[`Vec3Like`](../interfaces/Vec3Like.md)

#### Returns

`void`

***

### addTrimeshFromObject()

> **addTrimeshFromObject**(`obj`): `void`

Defined in: [src/physics/RapierPhysics.ts:277](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L277)

Cria colliders trimesh estáticos a partir das MALHAS de um `Object3D` (geometria
em espaço-mundo) — ex.: terreno + road viram chão pras rodas do [Vehicle](Vehicle.md)
raycastarem. Uma malha = um collider.

#### Parameters

##### obj

`Object3D`

#### Returns

`void`

***

### createVehicle()

> **createVehicle**(`spec`): [`Vehicle`](Vehicle.md)

Defined in: [src/physics/RapierPhysics.ts:306](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L306)

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

Defined in: [src/physics/RapierPhysics.ts:361](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L361)

Libera o mundo (memória WASM).

#### Returns

`void`

***

### step()

> **step**(): `void`

Defined in: [src/physics/RapierPhysics.ts:259](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L259)

Avança a simulação um passo (timestep fixo configurado no mundo).

#### Returns

`void`

***

### create()

> `static` **create**(`gravity?`): `Promise`\<`RapierPhysics`\>

Defined in: [src/physics/RapierPhysics.ts:238](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L238)

Inicializa o Rapier (async) e cria o mundo com a gravidade dada.

#### Parameters

##### gravity?

[`Vec3Like`](../interfaces/Vec3Like.md) = `...`

#### Returns

`Promise`\<`RapierPhysics`\>
