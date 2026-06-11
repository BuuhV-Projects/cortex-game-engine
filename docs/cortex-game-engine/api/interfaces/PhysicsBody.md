[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsBody

# Interface: PhysicsBody

Defined in: [src/physics/RapierPhysics.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L64)

Handle de um corpo físico (não vaza o tipo do Rapier).

## Methods

### rotation()

> **rotation**(): [`QuatLike`](QuatLike.md)

Defined in: [src/physics/RapierPhysics.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L68)

Rotação atual (quaternion).

#### Returns

[`QuatLike`](QuatLike.md)

***

### setNextKinematicTranslation()

> **setNextKinematicTranslation**(`p`): `void`

Defined in: [src/physics/RapierPhysics.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L70)

Move um corpo `kinematic` (aplicado no próximo `step`).

#### Parameters

##### p

[`Vec3Like`](Vec3Like.md)

#### Returns

`void`

***

### translation()

> **translation**(): [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L66)

Posição atual (centro do corpo).

#### Returns

[`Vec3Like`](Vec3Like.md)
