[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierPhysics

# Class: RapierPhysics

Defined in: [src/physics/RapierPhysics.ts:197](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L197)

## Properties

### maxStepsPerFrame

> **maxStepsPerFrame**: `number` = `MAX_PHYSICS_STEPS`

Defined in: [src/physics/RapierPhysics.ts:204](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L204)

Máximo de passos por [RapierPhysics.advance](#advance) (ADR-0672; default [MAX\_PHYSICS\_STEPS](../variables/MAX_PHYSICS_STEPS.md)). Suba para a
física acompanhar o relógio em quadros lentos, ao custo de mais passos justo quando o quadro pesa.

***

### world

> `readonly` **world**: `World`

Defined in: [src/physics/RapierPhysics.ts:199](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L199)

Mundo do Rapier (uso avançado).

## Methods

### addBody()

> **addBody**(`spec`): [`PhysicsBody`](../interfaces/PhysicsBody.md)

Defined in: [src/physics/RapierPhysics.ts:217](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L217)

Adiciona um corpo (RigidBody + Collider) e devolve seu handle.

#### Parameters

##### spec

[`BodySpec`](../interfaces/BodySpec.md)

#### Returns

[`PhysicsBody`](../interfaces/PhysicsBody.md)

***

### addTrimesh()

> **addTrimesh**(`vertices`, `indices`, `position?`): `void`

Defined in: [src/physics/RapierPhysics.ts:270](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L270)

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

Defined in: [src/physics/RapierPhysics.ts:283](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L283)

Cria colliders trimesh estáticos a partir das MALHAS de um `Object3D` (geometria
em espaço-mundo) — ex.: terreno + road viram chão pras rodas do [Vehicle](Vehicle.md)
raycastarem. Uma malha = um collider.

#### Parameters

##### obj

`Object3D`

#### Returns

`void`

***

### advance()

> **advance**(`dt`, `beforeEachStep?`): `number`

Defined in: [src/physics/RapierPhysics.ts:255](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L255)

Avança a simulação `dt` segundos em passos IGUAIS de no máximo
[MAX\_PHYSICS\_STEP\_S](../variables/MAX_PHYSICS_STEP_S.md) (semi-fixed timestep — ADR-0257), com no máximo
[RapierPhysics.maxStepsPerFrame](#maxstepsperframe) passos (ADR-0672): acima disso o
excedente é descartado e a simulação anda menos que `dt`.

Use no lugar de um `step()` por frame: aquele anda sempre 1/60 s, então a
velocidade da física passa a depender do fps (a 75 fps, 25% rápida demais).
Passo fixo sem interpolação também não serve: a 75 Hz, 1 frame em 5 fica
sem passo nenhum, e o objeto parado nele.

#### Parameters

##### dt

`number`

tempo do frame (s). `0` ou negativo não avança.

##### beforeEachStep?

(`step`) => `void`

chamado antes de cada passo com o passo (s) — onde
  veículos fazem `update`/aderência.

#### Returns

`number`

quantos passos foram dados.

#### Example

```ts
physics.advance(dtSeconds, (step) => vehicle.update(step));
```

***

### createVehicle()

> **createVehicle**(`spec`): [`Vehicle`](Vehicle.md)

Defined in: [src/physics/RapierPhysics.ts:293](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L293)

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

Defined in: [src/physics/RapierPhysics.ts:301](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L301)

Libera o mundo (memória WASM).

#### Returns

`void`

***

### step()

> **step**(): `void`

Defined in: [src/physics/RapierPhysics.ts:232](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L232)

Avança a simulação um passo (timestep fixo configurado no mundo).

#### Returns

`void`

***

### create()

> `static` **create**(`gravity?`): `Promise`\<`RapierPhysics`\>

Defined in: [src/physics/RapierPhysics.ts:211](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L211)

Inicializa o Rapier (async) e cria o mundo com a gravidade dada.

#### Parameters

##### gravity?

[`Vec3Like`](../interfaces/Vec3Like.md) = `...`

#### Returns

`Promise`\<`RapierPhysics`\>
