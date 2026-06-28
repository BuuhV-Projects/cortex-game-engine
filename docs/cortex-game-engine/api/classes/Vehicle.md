[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Vehicle

# Class: Vehicle

Defined in: [src/physics/RapierPhysics.ts:392](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L392)

**Veículo raycast** (ADR-0081) — wrapper do `DynamicRayCastVehicleController` do
Rapier. Aplica motor/freio/esterço, avança a simulação do veículo e expõe o
transform do chassi e de cada roda (pra sincronizar as malhas do `.glb`). As rodas
raycastam o mundo Rapier (terreno = collider) no WASM. Crie via
[RapierPhysics.createVehicle](RapierPhysics.md#createvehicle); chame [Vehicle.update](#update) APÓS `physics.step()`.

## Constructors

### Constructor

> **new Vehicle**(`ctrl`, `body`, `wheels`): `Vehicle`

Defined in: [src/physics/RapierPhysics.ts:393](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L393)

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

Defined in: [src/physics/RapierPhysics.ts:397](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L397)

As rodas, na ordem em que foram adicionadas.

## Accessors

### wheelCount

#### Get Signature

> **get** **wheelCount**(): `number`

Defined in: [src/physics/RapierPhysics.ts:451](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L451)

Número de rodas.

##### Returns

`number`

## Methods

### applyTuning()

> **applyTuning**(`t`): `void`

Defined in: [src/physics/RapierPhysics.ts:502](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L502)

Aplica AO VIVO parâmetros de suspensão/grip em TODAS as rodas (ex.: editar no
Inspector sem reiniciar). Só mexe nos campos informados. (Massa e centro de massa
NÃO mudam aqui — precisam recriar o veículo.)

#### Parameters

##### t

###### frictionSlip?

`number`

###### maxSuspensionTravel?

`number`

###### suspensionCompression?

`number`

###### suspensionRelaxation?

`number`

###### suspensionRestLength?

`number`

###### suspensionStiffness?

`number`

#### Returns

`void`

***

### chassisRotation()

> **chassisRotation**(): [`QuatLike`](../interfaces/QuatLike.md)

Defined in: [src/physics/RapierPhysics.ts:459](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L459)

#### Returns

[`QuatLike`](../interfaces/QuatLike.md)

***

### chassisTranslation()

> **chassisTranslation**(): [`Vec3Like`](../interfaces/Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:455](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L455)

#### Returns

[`Vec3Like`](../interfaces/Vec3Like.md)

***

### forwardSpeed()

> **forwardSpeed**(): `number`

Defined in: [src/physics/RapierPhysics.ts:422](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L422)

Velocidade ao longo do forward (+Z local) do chassi, m/s (sinal = frente/ré).

#### Returns

`number`

***

### keepUpright()

> **keepUpright**(`strength`, `damping`, `dt`): `void`

Defined in: [src/physics/RapierPhysics.ts:527](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L527)

**Anti-capotamento** (estabilizador de rolagem): corrige a INCLINAÇÃO lateral do
carro (rotação no eixo de avanço) de volta pra cima, sem mexer no esterço (yaw). Use
por frame ANTES do `physics.step()`. `strength` puxa pra cima; `damping` freia a
rolagem. Não impede capotar de propósito a baixa força — só evita tombar em
curva/relevo. Mexe na velocidade angular (independe da inércia → fácil de tunar).

#### Parameters

##### strength

`number`

##### damping

`number`

##### dt

`number`

#### Returns

`void`

***

### lateralSpeed()

> **lateralSpeed**(): `number`

Defined in: [src/physics/RapierPhysics.ts:430](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L430)

Velocidade LATERAL (eixo +X local) do chassi, m/s — alto = derrapando/drift.

#### Returns

`number`

***

### reset()

> **reset**(`position?`, `rotation?`): `void`

Defined in: [src/physics/RapierPhysics.ts:542](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L542)

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

Defined in: [src/physics/RapierPhysics.ts:407](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L407)

Freio em todas as rodas.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setEngineForce()

> **setEngineForce**(`force`): `void`

Defined in: [src/physics/RapierPhysics.ts:401](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L401)

Força do motor nas rodas com tração (N). 0 = desliga.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setSteering()

> **setSteering**(`angle`): `void`

Defined in: [src/physics/RapierPhysics.ts:411](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L411)

Ângulo de esterço (rad) nas rodas que esterçam.

#### Parameters

##### angle

`number`

#### Returns

`void`

***

### update()

> **update**(`dt`): `void`

Defined in: [src/physics/RapierPhysics.ts:417](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L417)

Avança a física do veículo. Chame DEPOIS de `physics.step()`.

#### Parameters

##### dt

`number`

#### Returns

`void`

***

### wheelContactPoint()

> **wheelContactPoint**(`i`, `out`): `boolean`

Defined in: [src/physics/RapierPhysics.ts:443](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L443)

Escreve em `out` o ponto de contato MUNDIAL da roda `i`; `false` se não há contato.

#### Parameters

##### i

`number`

##### out

`Vector3`

#### Returns

`boolean`

***

### wheelIsInContact()

> **wheelIsInContact**(`i`): `boolean`

Defined in: [src/physics/RapierPhysics.ts:438](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L438)

A roda `i` está tocando o chão?

#### Parameters

##### i

`number`

#### Returns

`boolean`

***

### wheelLocalTransform()

> **wheelLocalTransform**(`i`, `outPos`, `outQuat`, `spinAngle?`): `void`

Defined in: [src/physics/RapierPhysics.ts:486](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L486)

Transform LOCAL da roda `i` (relativo ao chassi) — pra sincronizar a malha da roda
quando ela é **filha** do carro (que já segue o chassi). Inclui suspensão (sobe/desce),
esterço (gira no Y) e rolagem (gira no eixo X).

#### Parameters

##### i

`number`

##### outPos

`Vector3`

##### outQuat

`Quaternion`

##### spinAngle?

`number` = `0`

#### Returns

`void`

***

### wheelTransform()

> **wheelTransform**(`i`, `outPos`, `outQuat`): `void`

Defined in: [src/physics/RapierPhysics.ts:465](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L465)

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
