[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsBody

# Interface: PhysicsBody

Defined in: [src/physics/RapierPhysics.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L110)

Handle de um corpo físico (não vaza o tipo do Rapier). Além de ler a pose
([PhysicsBody.translation](#translation)/[PhysicsBody.rotation](#rotation)), expõe as operações
comuns de corpo **dinâmico** pra gameplay (chutar uma bola, dar um pulo, resetar a
posição) sem precisar furar pro `RigidBody` interno. Pegue o handle via
`entity.getComponent(RapierBodyComponent)!.body` (existe depois do 1º tick).

## Example

```ts
// chutar a bola na direção `dir` (Vec3) com força `power`:
const ball = entity.getComponent(RapierBodyComponent)!.body
ball?.applyImpulse({ x: dir.x * power, y: 0, z: dir.z * power })
// resetar a bola pro centro do campo (zera velocidade + teleporta):
ball?.reset({ x: 0, y: 0.5, z: 0 })
```

## Methods

### angvel()

> **angvel**(): [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L118)

Velocidade angular atual (rad/s).

#### Returns

[`Vec3Like`](Vec3Like.md)

***

### applyImpulse()

> **applyImpulse**(`impulse`, `wakeUp?`): `void`

Defined in: [src/physics/RapierPhysics.ts:125](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L125)

Aplica um **impulso** (mudança instantânea de momento) no centro do corpo —
o jeito típico de "chutar"/"empurrar" um corpo dinâmico. Acorda o corpo.

#### Parameters

##### impulse

[`Vec3Like`](Vec3Like.md)

##### wakeUp?

`boolean`

#### Returns

`void`

***

### applyTorqueImpulse()

> **applyTorqueImpulse**(`torque`, `wakeUp?`): `void`

Defined in: [src/physics/RapierPhysics.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L127)

Aplica um **impulso de torque** (gira o corpo). Acorda o corpo.

#### Parameters

##### torque

[`Vec3Like`](Vec3Like.md)

##### wakeUp?

`boolean`

#### Returns

`void`

***

### linvel()

> **linvel**(): [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L116)

Velocidade linear atual (unidades/s).

#### Returns

[`Vec3Like`](Vec3Like.md)

***

### reset()

> **reset**(`position?`, `rotation?`): `void`

Defined in: [src/physics/RapierPhysics.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L143)

**Reseta** o corpo: zera as velocidades (linear+angular) e, se passar `position`/
`rotation`, teleporta pra lá. Ideal pra "recolocar a bola no centro" sem o corpo
sair voando com a velocidade que tinha.

#### Parameters

##### position?

[`Vec3Like`](Vec3Like.md)

##### rotation?

[`QuatLike`](QuatLike.md)

#### Returns

`void`

***

### rotation()

> **rotation**(): [`QuatLike`](QuatLike.md)

Defined in: [src/physics/RapierPhysics.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L114)

Rotação atual (quaternion).

#### Returns

[`QuatLike`](QuatLike.md)

***

### setAngvel()

> **setAngvel**(`velocity`, `wakeUp?`): `void`

Defined in: [src/physics/RapierPhysics.ts:131](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L131)

Define a **velocidade angular** diretamente. Acorda o corpo.

#### Parameters

##### velocity

[`Vec3Like`](Vec3Like.md)

##### wakeUp?

`boolean`

#### Returns

`void`

***

### setLinvel()

> **setLinvel**(`velocity`, `wakeUp?`): `void`

Defined in: [src/physics/RapierPhysics.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L129)

Define a **velocidade linear** diretamente (sobrescreve a atual). Acorda o corpo.

#### Parameters

##### velocity

[`Vec3Like`](Vec3Like.md)

##### wakeUp?

`boolean`

#### Returns

`void`

***

### setNextKinematicTranslation()

> **setNextKinematicTranslation**(`p`): `void`

Defined in: [src/physics/RapierPhysics.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L120)

Move um corpo `kinematic` (aplicado no próximo `step`).

#### Parameters

##### p

[`Vec3Like`](Vec3Like.md)

#### Returns

`void`

***

### setRotation()

> **setRotation**(`q`, `wakeUp?`): `void`

Defined in: [src/physics/RapierPhysics.ts:135](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L135)

Define a rotação (quaternion) diretamente.

#### Parameters

##### q

[`QuatLike`](QuatLike.md)

##### wakeUp?

`boolean`

#### Returns

`void`

***

### setTranslation()

> **setTranslation**(`p`, `wakeUp?`): `void`

Defined in: [src/physics/RapierPhysics.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L133)

**Teleporta** o corpo (pose). Pra dinâmico, considere [PhysicsBody.reset](#reset).

#### Parameters

##### p

[`Vec3Like`](Vec3Like.md)

##### wakeUp?

`boolean`

#### Returns

`void`

***

### translation()

> **translation**(): [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L112)

Posição atual (centro do corpo).

#### Returns

[`Vec3Like`](Vec3Like.md)

***

### wakeUp()

> **wakeUp**(): `void`

Defined in: [src/physics/RapierPhysics.ts:137](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L137)

Acorda o corpo (corpos parados "dormem" e ignoram forças até serem acordados).

#### Returns

`void`
