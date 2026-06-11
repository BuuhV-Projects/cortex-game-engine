[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierPhysics

# Class: RapierPhysics

Defined in: [src/physics/RapierPhysics.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L107)

## Properties

### world

> `readonly` **world**: `World`

Defined in: [src/physics/RapierPhysics.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L109)

Mundo do Rapier (uso avançado).

## Methods

### addBody()

> **addBody**(`spec`): [`PhysicsBody`](../interfaces/PhysicsBody.md)

Defined in: [src/physics/RapierPhysics.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L122)

Adiciona um corpo (RigidBody + Collider) e devolve seu handle.

#### Parameters

##### spec

[`BodySpec`](../interfaces/BodySpec.md)

#### Returns

[`PhysicsBody`](../interfaces/PhysicsBody.md)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/physics/RapierPhysics.ts:142](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L142)

Libera o mundo (memória WASM).

#### Returns

`void`

***

### step()

> **step**(): `void`

Defined in: [src/physics/RapierPhysics.ts:137](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L137)

Avança a simulação um passo (timestep fixo configurado no mundo).

#### Returns

`void`

***

### create()

> `static` **create**(`gravity?`): `Promise`\<`RapierPhysics`\>

Defined in: [src/physics/RapierPhysics.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L116)

Inicializa o Rapier (async) e cria o mundo com a gravidade dada.

#### Parameters

##### gravity?

[`Vec3Like`](../interfaces/Vec3Like.md) = `...`

#### Returns

`Promise`\<`RapierPhysics`\>
