[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsBody

# Interface: PhysicsBody

Defined in: src/physics/RapierPhysics.ts:58

Handle de um corpo físico (não vaza o tipo do Rapier).

## Methods

### rotation()

> **rotation**(): [`QuatLike`](QuatLike.md)

Defined in: src/physics/RapierPhysics.ts:62

Rotação atual (quaternion).

#### Returns

[`QuatLike`](QuatLike.md)

***

### setNextKinematicTranslation()

> **setNextKinematicTranslation**(`p`): `void`

Defined in: src/physics/RapierPhysics.ts:64

Move um corpo `kinematic` (aplicado no próximo `step`).

#### Parameters

##### p

[`Vec3Like`](Vec3Like.md)

#### Returns

`void`

***

### translation()

> **translation**(): [`Vec3Like`](Vec3Like.md)

Defined in: src/physics/RapierPhysics.ts:60

Posição atual (centro do corpo).

#### Returns

[`Vec3Like`](Vec3Like.md)
