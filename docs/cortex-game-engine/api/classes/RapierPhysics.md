[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierPhysics

# Class: RapierPhysics

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:262](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L262)

## Properties

### world

> `readonly` **world**: `World`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:264](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L264)

Mundo do Rapier (uso avançado).

## Methods

### addBody()

> **addBody**(`spec`): [`PhysicsBody`](../interfaces/PhysicsBody.md)

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:277](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L277)

Adiciona um corpo (RigidBody + Collider) e devolve seu handle.

#### Parameters

##### spec

[`BodySpec`](../interfaces/BodySpec.md)

#### Returns

[`PhysicsBody`](../interfaces/PhysicsBody.md)

***

### addTrimesh()

> **addTrimesh**(`vertices`, `indices`, `position?`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:329](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L329)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:342](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L342)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:313](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L313)

Avança a simulação `dt` segundos em passos IGUAIS de no máximo
[MAX\_PHYSICS\_STEP\_S](../variables/MAX_PHYSICS_STEP_S.md) (semi-fixed timestep — ADR-0257).

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:372](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L372)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:419](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L419)

Libera o mundo (memória WASM).

#### Returns

`void`

***

### step()

> **step**(): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:292](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L292)

Avança a simulação um passo (timestep fixo configurado no mundo).

#### Returns

`void`

***

### create()

> `static` **create**(`gravity?`): `Promise`\<`RapierPhysics`\>

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:271](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L271)

Inicializa o Rapier (async) e cria o mundo com a gravidade dada.

#### Parameters

##### gravity?

[`Vec3Like`](../interfaces/Vec3Like.md) = `...`

#### Returns

`Promise`\<`RapierPhysics`\>
