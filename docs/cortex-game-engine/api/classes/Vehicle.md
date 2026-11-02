[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Vehicle

# Class: Vehicle

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:450](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L450)

**Veículo raycast** (ADR-0081) — wrapper do `DynamicRayCastVehicleController` do
Rapier. Aplica motor/freio/esterço, avança a simulação do veículo e expõe o
transform do chassi e de cada roda (pra sincronizar as malhas do `.glb`). As rodas
raycastam o mundo Rapier (terreno = collider) no WASM. Crie via
[RapierPhysics.createVehicle](RapierPhysics.md#createvehicle); chame [Vehicle.update](#update) APÓS `physics.step()`.

## Constructors

### Constructor

> **new Vehicle**(`ctrl`, `body`, `wheels`, `halfExtents?`, `suspension?`): `Vehicle`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:465](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L465)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:471](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L471)

Corpo rígido do chassi. Público para quem precisa agir sobre ele direto —
impulso, aderência ao chão ([GroundAdhesion](GroundAdhesion.md)).

***

### wheelFilterGroups

> **wheelFilterGroups**: `number` \| `undefined` = `undefined`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:459](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L459)

Grupos de interação (`InteractionGroups` do Rapier) do raycast das rodas.
`undefined` = as rodas enxergam tudo.

Grupos, e não um callback por collider, porque o host nativo ignora o
callback (SPEC-0209) — um filtro que só funciona no Studio é pior que
nenhum. Uso típico: carro em respawn vira fantasma (SPEC-0259).

***

### wheels

> `readonly` **wheels**: [`VehicleWheelSpec`](../interfaces/VehicleWheelSpec.md)[]

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:473](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L473)

As rodas, na ordem em que foram adicionadas.

## Accessors

### engineForce

#### Get Signature

> **get** **engineForce**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:529](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L529)

A última força do motor pedida (N).

##### Returns

`number`

***

### suspensionRestLength

#### Get Signature

> **get** **suspensionRestLength**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:490](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L490)

Comprimento de repouso da suspensão (m), igual em todas as rodas.
Guardado aqui, e não lido do controller, porque o shim do host nativo não
implementa esse getter.

##### Returns

`number`

***

### suspensionStiffness

#### Get Signature

> **get** **suspensionStiffness**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:495](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L495)

Rigidez da suspensão, igual em todas as rodas. Ver [suspensionRestLength](#suspensionrestlength).

##### Returns

`number`

***

### wheelCount

#### Get Signature

> **get** **wheelCount**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:591](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L591)

Número de rodas.

##### Returns

`number`

## Methods

### angvelSquared()

> **angvelSquared**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:549](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L549)

Velocidade angular² do chassi (rad²/s²).

#### Returns

`number`

***

### applyTuning()

> **applyTuning**(`t`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:642](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L642)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:599](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L599)

#### Returns

[`QuatLike`](../interfaces/QuatLike.md)

***

### chassisTranslation()

> **chassisTranslation**(): [`Vec3Like`](../interfaces/Vec3Like.md)

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:595](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L595)

#### Returns

[`Vec3Like`](../interfaces/Vec3Like.md)

***

### forwardSpeed()

> **forwardSpeed**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:562](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L562)

Velocidade ao longo do forward (+Z local) do chassi, m/s (sinal = frente/ré).

#### Returns

`number`

***

### keepUpright()

> **keepUpright**(`strength`, `damping`, `dt`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:669](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L669)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:570](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L570)

Velocidade LATERAL (eixo +X local) do chassi, m/s — alto = derrapando/drift.

#### Returns

`number`

***

### linvelSquared()

> **linvelSquared**(): `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:544](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L544)

Velocidade linear² do chassi (m²/s²) — a regra de repouso da SPEC-0655.

#### Returns

`number`

***

### reset()

> **reset**(`position?`, `rotation?`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:687](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L687)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:533](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L533)

Freio em todas as rodas.

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setEngineForce()

> **setEngineForce**(`force`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:521](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L521)

Força do motor nas rodas com tração (N). 0 = desliga. Força ≠ 0 acorda o chassi (SPEC-0655).

#### Parameters

##### force

`number`

#### Returns

`void`

***

### setMassProperties()

> **setMassProperties**(`mass`, `centerOfMass`, `yawInertiaScale?`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:504](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L504)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:537](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L537)

Ângulo de esterço (rad) nas rodas que esterçam. Ângulo ≠ 0 acorda o chassi (SPEC-0655).

#### Parameters

##### angle

`number`

#### Returns

`void`

***

### update()

> **update**(`dt`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:557](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L557)

Avança a física do veículo. Chame DEPOIS de `physics.step()`.

#### Parameters

##### dt

`number`

#### Returns

`void`

***

### wheelContactPoint()

> **wheelContactPoint**(`i`, `out`): `boolean`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:583](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L583)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:578](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L578)

A roda `i` está tocando o chão?

#### Parameters

##### i

`number`

#### Returns

`boolean`

***

### wheelLocalTransform()

> **wheelLocalTransform**(`i`, `outPos`, `outQuat`, `spinAngle?`): `void`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:626](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L626)

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

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:605](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L605)

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
