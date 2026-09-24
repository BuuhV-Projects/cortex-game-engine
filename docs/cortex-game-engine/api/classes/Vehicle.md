[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Vehicle

# Class: Vehicle

Defined in: [src/physics/RapierPhysics.ts:437](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L437)

**Veículo raycast** (ADR-0081) — wrapper do `DynamicRayCastVehicleController` do
Rapier. Aplica motor/freio/esterço, avança a simulação do veículo e expõe o
transform do chassi e de cada roda (pra sincronizar as malhas do `.glb`). As rodas
raycastam o mundo Rapier (terreno = collider) no WASM. Crie via
[RapierPhysics.createVehicle](RapierPhysics.md#createvehicle); chame [Vehicle.update](#update) APÓS `physics.step()`.

## Constructors

### Constructor

> **new Vehicle**(`ctrl`, `body`, `wheels`, `halfExtents?`, `suspension?`): `Vehicle`

Defined in: [src/physics/RapierPhysics.ts:451](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L451)

#### Parameters

##### ctrl

`DynamicRayCastVehicleController`

##### body

`RigidBody`

Corpo rígido do chassi. Público para quem precisa agir sobre ele direto —
impulso, aderência ao chão ([GroundAdhesion](GroundAdhesion.md)).

##### wheels

[`VehicleWheelSpec`](../interfaces/VehicleWheelSpec.md)[]

As rodas, na ordem em que foram adicionadas.

##### halfExtents?

[`Vec3Like`](../interfaces/Vec3Like.md) = `...`

Meia-extensão do chassi (pra recalcular a inércia ao mudar massa/CM).

##### suspension?

###### restLength

`number`

###### stiffness

`number`

#### Returns

`Vehicle`

## Properties

### body

> `readonly` **body**: `RigidBody`

Defined in: [src/physics/RapierPhysics.ts:457](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L457)

Corpo rígido do chassi. Público para quem precisa agir sobre ele direto —
impulso, aderência ao chão ([GroundAdhesion](GroundAdhesion.md)).

***

### wheelFilterGroups

> **wheelFilterGroups**: `number` \| `undefined` = `undefined`

Defined in: [src/physics/RapierPhysics.ts:446](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L446)

Grupos de interação (`InteractionGroups` do Rapier) do raycast das rodas.
`undefined` = as rodas enxergam tudo.

Grupos, e não um callback por collider, porque o host nativo ignora o
callback (SPEC-0209) — um filtro que só funciona no Studio é pior que
nenhum. Uso típico: carro em respawn vira fantasma (SPEC-0259).

***

### wheels

> `readonly` **wheels**: [`VehicleWheelSpec`](../interfaces/VehicleWheelSpec.md)[]

Defined in: [src/physics/RapierPhysics.ts:459](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L459)

As rodas, na ordem em que foram adicionadas.

## Accessors

### suspensionRestLength

#### Get Signature

> **get** **suspensionRestLength**(): `number`

Defined in: [src/physics/RapierPhysics.ts:476](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L476)

Comprimento de repouso da suspensão (m), igual em todas as rodas.
Guardado aqui, e não lido do controller, porque o shim do host nativo não
implementa esse getter.

##### Returns

`number`

***

### suspensionStiffness

#### Get Signature

> **get** **suspensionStiffness**(): `number`

Defined in: [src/physics/RapierPhysics.ts:481](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L481)

Rigidez da suspensão, igual em todas as rodas. Ver [suspensionRestLength](#suspensionrestlength).

##### Returns

`number`

***

### wheelCount

#### Get Signature

> **get** **wheelCount**(): `number`

Defined in: [src/physics/RapierPhysics.ts:557](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L557)

Número de rodas.

##### Returns

`number`

## Methods

### applyTuning()

> **applyTuning**(`t`): `void`

Defined in: [src/physics/RapierPhysics.ts:608](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L608)

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

Defined in: [src/physics/RapierPhysics.ts:565](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L565)

#### Returns

[`QuatLike`](../interfaces/QuatLike.md)

***

### chassisTranslation()

> **chassisTranslation**(): [`Vec3Like`](../interfaces/Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:561](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L561)

#### Returns

[`Vec3Like`](../interfaces/Vec3Like.md)

***

### forwardSpeed()

> **forwardSpeed**(): `number`

Defined in: [src/physics/RapierPhysics.ts:528](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L528)

Velocidade ao longo do forward (+Z local) do chassi, m/s (sinal = frente/ré).

#### Returns

`number`

***

### keepUpright()

> **keepUpright**(`strength`, `damping`, `dt`): `void`

Defined in: [src/physics/RapierPhysics.ts:635](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L635)

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

Defined in: [src/physics/RapierPhysics.ts:536](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L536)

Velocidade LATERAL (eixo +X local) do chassi, m/s — alto = derrapando/drift.

#### Returns

`number`

***

### reset()

> **reset**(`position?`, `rotation?`): `void`

Defined in: [src/physics/RapierPhysics.ts:650](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L650)

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

Defined in: [src/physics/RapierPhysics.ts:513](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L513)

Freio em todas as rodas.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setEngineForce()

> **setEngineForce**(`force`): `void`

Defined in: [src/physics/RapierPhysics.ts:507](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L507)

Força do motor nas rodas com tração (N). 0 = desliga.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setMassProperties()

> **setMassProperties**(`mass`, `centerOfMass`, `yawInertiaScale?`): `void`

Defined in: [src/physics/RapierPhysics.ts:490](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L490)

Define massa + centro de massa AO VIVO (sem recriar o veículo) — ex.: editar no
Inspector. A inércia é recalculada como caixa (`m/3·(a²+b²)`). Requer o veículo criado
com `centerOfMass` (collider sem massa).

#### Parameters

##### mass

`number`

##### centerOfMass

[`Vec3Like`](../interfaces/Vec3Like.md)

##### yawInertiaScale?

`number` = `1`

#### Returns

`void`

***

### setSteering()

> **setSteering**(`angle`): `void`

Defined in: [src/physics/RapierPhysics.ts:517](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L517)

Ângulo de esterço (rad) nas rodas que esterçam.

#### Parameters

##### angle

`number`

#### Returns

`void`

***

### update()

> **update**(`dt`): `void`

Defined in: [src/physics/RapierPhysics.ts:523](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L523)

Avança a física do veículo. Chame DEPOIS de `physics.step()`.

#### Parameters

##### dt

`number`

#### Returns

`void`

***

### wheelContactPoint()

> **wheelContactPoint**(`i`, `out`): `boolean`

Defined in: [src/physics/RapierPhysics.ts:549](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L549)

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

Defined in: [src/physics/RapierPhysics.ts:544](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L544)

A roda `i` está tocando o chão?

#### Parameters

##### i

`number`

#### Returns

`boolean`

***

### wheelLocalTransform()

> **wheelLocalTransform**(`i`, `outPos`, `outQuat`, `spinAngle?`): `void`

Defined in: [src/physics/RapierPhysics.ts:592](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L592)

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

Defined in: [src/physics/RapierPhysics.ts:571](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L571)

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
